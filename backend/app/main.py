import hashlib
import mimetypes
import re
import secrets
from datetime import timedelta
from uuid import uuid4
from urllib.parse import quote
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File as Upload
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .database import Base, engine, get_db
from .models import User, Session, Folder, File, Share, now
from .storage import storage

Base.metadata.create_all(engine)
app = FastAPI(title='CloudVault API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Content-Type'])
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash('constant-time-placeholder')


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


@app.middleware('http')
async def protect_requests(request: Request, call_next):
    # Browser writes must originate from the configured UI (CSRF protection).
    if request.method in {'POST', 'PATCH', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin != settings.frontend_origin:
            return Response('Untrusted origin', status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response


def current_user(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get('cloudvault_session', '')
    session = db.get(Session, digest(token))
    if not session or session.expires_at <= now():
        raise HTTPException(401, 'Please sign in')
    return db.get(User, session.user_id)


def owned(db, model, item_id, user):
    item = db.get(model, item_id)
    if not item or item.owner_id != user.id:
        raise HTTPException(404, 'Item not found')
    return item


def filename(value):
    value = value.strip()
    if not value or len(value) > 180 or value in {'.', '..'} or re.search(r'[<>:"/\\|?*\x00-\x1f\x7f]', value) or value.endswith('.'):
        raise HTTPException(422, 'Use a name of 1–180 characters without path or special characters')
    return value


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default='CloudVault user', min_length=1, max_length=100)


def user_json(user):
    return {'id': user.id, 'name': user.name, 'email': user.email}


def sign_in(response, db, user):
    token = secrets.token_urlsafe(32)
    db.add(Session(token_hash=digest(token), user_id=user.id, expires_at=now() + timedelta(hours=settings.session_hours)))
    db.commit()
    response.set_cookie('cloudvault_session', token, httponly=True, secure=settings.cookie_secure, samesite='lax', max_age=settings.session_hours * 3600)
    return user_json(user)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'storage': settings.storage_provider, 'database': engine.dialect.name, 'max_upload_mb': settings.max_upload_mb, 'azure_connected': False}


@app.post('/api/auth/register', status_code=201)
def register(body: Credentials, response: Response, db: DBSession = Depends(get_db)):
    email = body.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or not body.name.strip():
        raise HTTPException(422, 'Enter a valid name and email')
    user = User(email=email, name=body.name.strip(), password_hash=passwords.hash(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'An account with this email already exists')
    return sign_in(response, db, user)


@app.post('/api/auth/login')
def login(body: Credentials, response: Response, db: DBSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, 'Email or password is incorrect')
    return sign_in(response, db, user)


@app.get('/api/auth/me')
def me(user=Depends(current_user)):
    return user_json(user)


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    db.execute(delete(Session).where(Session.token_hash == digest(request.cookies.get('cloudvault_session', ''))))
    db.commit()
    response.delete_cookie('cloudvault_session')
    return {'ok': True}


def file_json(item, user):
    return {'id': item.id, 'name': item.name, 'size': item.size, 'content_type': item.content_type, 'folder_id': item.folder_id, 'created_at': item.created_at.isoformat() + 'Z', 'owner': user.name}


def attachment(item):
    return StreamingResponse(storage.read(item.blob_key), media_type='application/octet-stream', headers={
        'Content-Disposition': "attachment; filename*=UTF-8''" + quote(item.name, safe=''),
        'Content-Length': str(item.size),
    })


@app.get('/api/files')
def files(user=Depends(current_user), db: DBSession = Depends(get_db)):
    return [file_json(f, user) for f in db.scalars(select(File).where(File.owner_id == user.id).order_by(File.created_at.desc()))]


@app.get('/api/folders')
def folders(user=Depends(current_user), db: DBSession = Depends(get_db)):
    return [{'id': f.id, 'name': f.name, 'parent_id': f.parent_id} for f in db.scalars(select(Folder).where(Folder.owner_id == user.id))]


class FolderInput(BaseModel):
    name: str
    parent_id: str | None = None


@app.post('/api/folders', status_code=201)
def create_folder(body: FolderInput, user=Depends(current_user), db: DBSession = Depends(get_db)):
    if body.parent_id:
        owned(db, Folder, body.parent_id, user)
    name = filename(body.name)
    if db.scalar(select(Folder).where(Folder.owner_id == user.id, Folder.parent_id == body.parent_id, Folder.name == name)):
        raise HTTPException(409, 'A folder with this name already exists')
    folder = Folder(name=name, owner_id=user.id, parent_id=body.parent_id)
    db.add(folder)
    db.commit()
    return {'id': folder.id, 'name': folder.name, 'parent_id': folder.parent_id}


@app.post('/api/files', status_code=201)
def upload(file: UploadFile = Upload(...), folder_id: str | None = None, user=Depends(current_user), db: DBSession = Depends(get_db)):
    if folder_id:
        owned(db, Folder, folder_id, user)
    name = filename(file.filename or '')
    key = uuid4().hex
    try:
        size = storage.put(key, file.file)
    except ValueError as error:
        raise HTTPException(413, str(error))
    item = File(name=name, owner_id=user.id, folder_id=folder_id, blob_key=key, size=size, content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')
    try:
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(key)
        raise
    finally:
        file.file.close()
    return file_json(item, user)


@app.get('/api/files/{item_id}/download')
def download(item_id: str, user=Depends(current_user), db: DBSession = Depends(get_db)):
    item = owned(db, File, item_id, user)
    return attachment(item)


class FileUpdate(BaseModel):
    name: str | None = None
    folder_id: str | None = None


@app.patch('/api/files/{item_id}')
def update_file(item_id: str, body: FileUpdate, user=Depends(current_user), db: DBSession = Depends(get_db)):
    item = owned(db, File, item_id, user)
    if body.name is not None:
        item.name = filename(body.name)
        item.content_type = mimetypes.guess_type(item.name)[0] or 'application/octet-stream'
    if 'folder_id' in body.model_fields_set:
        if body.folder_id:
            owned(db, Folder, body.folder_id, user)
        item.folder_id = body.folder_id
    db.commit()
    return file_json(item, user)


@app.delete('/api/files/{item_id}')
def delete_file(item_id: str, user=Depends(current_user), db: DBSession = Depends(get_db)):
    item = owned(db, File, item_id, user)
    db.execute(delete(Share).where(Share.file_id == item.id))
    storage.delete(item.blob_key)
    db.delete(item)
    db.commit()
    return {'ok': True}


class ShareInput(BaseModel):
    hours: int = Field(default=24, ge=1, le=168)


@app.post('/api/files/{item_id}/shares', status_code=201)
def share(item_id: str, body: ShareInput, user=Depends(current_user), db: DBSession = Depends(get_db)):
    item = owned(db, File, item_id, user)
    token = secrets.token_urlsafe(32)
    record = Share(file_id=item.id, token_hash=digest(token), expires_at=now() + timedelta(hours=body.hours))
    db.add(record)
    db.commit()
    return {'id': record.id, 'url': f'{settings.public_api_url}/api/shared/{token}', 'expires_at': record.expires_at.isoformat() + 'Z'}


@app.get('/api/files/{item_id}/shares')
def shares(item_id: str, user=Depends(current_user), db: DBSession = Depends(get_db)):
    owned(db, File, item_id, user)
    return [{'id': s.id, 'expires_at': s.expires_at.isoformat() + 'Z'} for s in db.scalars(select(Share).where(Share.file_id == item_id, Share.expires_at > now()))]


@app.delete('/api/files/{item_id}/shares/{share_id}')
def revoke(item_id: str, share_id: str, user=Depends(current_user), db: DBSession = Depends(get_db)):
    owned(db, File, item_id, user)
    record = db.get(Share, share_id)
    if not record or record.file_id != item_id:
        raise HTTPException(404, 'Link not found')
    db.delete(record)
    db.commit()
    return {'ok': True}


@app.get('/api/shared/{token}')
def shared(token: str, db: DBSession = Depends(get_db)):
    record = db.scalar(select(Share).where(Share.token_hash == digest(token), Share.expires_at > now()))
    if not record:
        raise HTTPException(404, 'Link expired or revoked')
    item = db.get(File, record.file_id)
    return attachment(item)


@app.get('/api/files/{item_id}/versions')
def versions(item_id: str, user=Depends(current_user), db: DBSession = Depends(get_db)):
    owned(db, File, item_id, user)
    return {'supported': False, 'versions': [], 'message': 'Version history will be available after Azure Blob Storage versioning is connected.'}
