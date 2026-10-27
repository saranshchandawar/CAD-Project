-- CloudVault: Azure SQL schema. IDs and timestamps are assigned by the application.
-- File contents live in object storage; SQL contains metadata only.

CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	name NVARCHAR(100) NOT NULL, 
	email VARCHAR(254) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);
GO

CREATE UNIQUE INDEX ix_users_email ON users (email);
GO

CREATE TABLE sessions (
	token_hash VARCHAR(64) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	PRIMARY KEY (token_hash), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
GO

CREATE INDEX ix_sessions_user_id ON sessions (user_id);
GO

CREATE TABLE folders (
	id VARCHAR(36) NOT NULL, 
	name NVARCHAR(180) NOT NULL, 
	owner_id VARCHAR(36) NOT NULL, 
	parent_id VARCHAR(36) NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (owner_id, parent_id, name), 
	FOREIGN KEY(owner_id) REFERENCES users (id), 
	FOREIGN KEY(parent_id) REFERENCES folders (id)
);
GO

CREATE INDEX ix_folders_owner_id ON folders (owner_id);
GO

CREATE TABLE files (
	id VARCHAR(36) NOT NULL, 
	name NVARCHAR(180) NOT NULL, 
	owner_id VARCHAR(36) NOT NULL, 
	folder_id VARCHAR(36) NULL, 
	blob_key VARCHAR(255) NOT NULL, 
	size BIGINT NOT NULL, 
	content_type VARCHAR(255) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id), 
	FOREIGN KEY(folder_id) REFERENCES folders (id), 
	UNIQUE (blob_key)
);
GO

CREATE INDEX ix_files_owner_id ON files (owner_id);
GO

CREATE TABLE shares (
	id VARCHAR(36) NOT NULL, 
	file_id VARCHAR(36) NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at DATETIME NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(file_id) REFERENCES files (id), 
	UNIQUE (token_hash)
);
GO

CREATE INDEX ix_shares_file_id ON shares (file_id);
