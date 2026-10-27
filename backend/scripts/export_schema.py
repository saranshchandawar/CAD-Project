"""Emit SQL Server/Azure SQL DDL from the same models used by the API."""
from pathlib import Path
from sqlalchemy import create_mock_engine
from app.database import Base
from app import models  # noqa: F401

statements = []
engine = create_mock_engine('mssql+pyodbc://', lambda sql, *args, **kwargs: statements.append(str(sql.compile(dialect=engine.dialect)).strip() + ';'))
Base.metadata.create_all(engine)
target = Path('schema/azure_sql.sql')
target.parent.mkdir(exist_ok=True)
target.write_text('-- CloudVault: Azure SQL schema. IDs and timestamps are assigned by the application.\n-- File contents live in object storage; SQL contains metadata only.\n\n' + '\nGO\n\n'.join(statements) + '\n', encoding='utf-8')
print(f'Exported {target}')
