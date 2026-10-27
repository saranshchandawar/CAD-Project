"""Integration tests use isolated temporary SQLite and blob directories."""
import os
import tempfile
from datetime import timedelta
from pathlib import Path

test_root = Path(tempfile.mkdtemp(prefix='cloudvault-tests-'))
os.environ['DATABASE_URL'] = f'sqlite:///{test_root / "test.db"}'
os.environ['LOCAL_STORAGE_PATH'] = str(test_root / 'blobs')
os.environ['MAX_UPLOAD_MB'] = '1'
os.environ['STORAGE_PROVIDER'] = 'local'

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Share, now
from sqlalchemy import select
import pytest


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def account(email='owner@example.com'):
    client = TestClient(app)
    response = client.post('/api/auth/register', json={'name': 'Alex Morgan', 'email': email, 'password': 'safe-password-123'})
    assert response.status_code == 201
    assert 'HttpOnly' in response.headers['set-cookie']
    return client


def upload(client, name='notes.txt', content=b'cloud architecture'):
    response = client.post('/api/files', files={'file': (name, content)})
    assert response.status_code == 201, response.text
    return response.json()


def test_authentication_and_logout():
    client = TestClient(app)
    assert client.get('/api/files').status_code == 401
    client = account()
    assert client.get('/api/auth/me').json()['email'] == 'owner@example.com'
    assert client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'wrong-password'}).status_code == 401
    client.post('/api/auth/logout')
    assert client.get('/api/files').status_code == 401
    assert client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'safe-password-123'}).status_code == 200


def test_file_lifecycle_and_folders():
    client = account()
    folder = client.post('/api/folders', json={'name': 'Coursework'}).json()
    assert client.post('/api/folders', json={'name': 'Coursework'}).status_code == 409
    nested = client.post('/api/folders', json={'name': 'Week 1', 'parent_id': folder['id']})
    assert nested.status_code == 201
    item = upload(client)
    response = client.patch(f'/api/files/{item["id"]}', json={'name': 'lecture.txt', 'folder_id': folder['id']})
    assert response.status_code == 200
    assert response.json()['folder_id'] == folder['id']
    assert client.get(f'/api/files/{item["id"]}/download').content == b'cloud architecture'
    assert client.get(f'/api/files/{item["id"]}/versions').json()['supported'] is False
    assert client.patch(f'/api/files/{item["id"]}', json={'folder_id': None}).json()['folder_id'] is None
    assert client.delete(f'/api/files/{item["id"]}').status_code == 200
    assert client.get('/api/files').json() == []
    assert client.get(f'/api/files/{item["id"]}/download').status_code == 404


def test_cross_user_access_is_denied():
    owner, other = account(), account('other@example.com')
    item = upload(owner)
    folder = owner.post('/api/folders', json={'name': 'Private'}).json()
    share = owner.post(f'/api/files/{item["id"]}/shares', json={'hours': 1}).json()
    base = f'/api/files/{item["id"]}'
    for path in ['/download', '/versions', '/shares']:
        assert other.get(base + path).status_code == 404
    assert other.patch(base, json={'name': 'stolen.txt'}).status_code == 404
    assert other.delete(base).status_code == 404
    assert other.post(base + '/shares', json={'hours': 1}).status_code == 404
    assert other.delete(base + '/shares/' + share['id']).status_code == 404
    own_file = upload(other)
    assert other.patch('/api/files/' + own_file['id'], json={'folder_id': folder['id']}).status_code == 404
    assert other.post('/api/folders', json={'name': 'Intrusion', 'parent_id': folder['id']}).status_code == 404
    assert len(other.get('/api/files').json()) == 1
    assert other.get('/api/folders').json() == []


def test_share_expiration_revocation_and_delete():
    owner = account()
    anonymous = TestClient(app)
    item = upload(owner)
    base = f'/api/files/{item["id"]}'
    share = owner.post(base + '/shares', json={'hours': 1}).json()
    assert anonymous.get(share['url']).content == b'cloud architecture'
    with SessionLocal() as db:
        record = db.scalar(select(Share))
        assert record.token_hash not in share['url']
        record.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert anonymous.get(share['url']).status_code == 404
    share = owner.post(base + '/shares', json={'hours': 24}).json()
    owner.delete(base + '/shares/' + share['id'])
    assert anonymous.get(share['url']).status_code == 404
    share = owner.post(base + '/shares', json={'hours': 24}).json()
    owner.delete(base)
    assert anonymous.get(share['url']).status_code == 404


def test_upload_validation_and_csrf():
    client = account()
    assert client.post('/api/files', files={'file': ('../escape.txt', b'a')}).status_code == 422
    assert client.post('/api/files', files={'file': ('huge.txt', b'a' * (1024 * 1024 + 1))}).status_code == 413
    assert client.get('/api/files').json() == []
    assert client.post('/api/folders', json={'name': 'Invalid/name'}).status_code == 422
    assert client.post('/api/folders', json={'name': 'CSRF'}, headers={'Origin': 'https://evil.example'}).status_code == 403
