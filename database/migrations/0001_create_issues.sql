-- Issues and their screenshots.
-- All timestamps are stored in UTC (SYSUTCDATETIME); the browser shows them in local time.
-- Guarded with IF ... IS NULL so it is a no-op on databases created by the old schema.sql.

IF OBJECT_ID(N'dbo.Issues', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Issues (
        Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Issues PRIMARY KEY,
        Title       NVARCHAR(200)     NOT NULL,
        App         NVARCHAR(20)      NOT NULL CONSTRAINT DF_Issues_App DEFAULT N'HRMS',
        Description NVARCHAR(MAX)     NULL,
        Category    NVARCHAR(100)     NULL,
        Priority    NVARCHAR(20)      NOT NULL CONSTRAINT DF_Issues_Priority DEFAULT N'Medium',
        Status      NVARCHAR(20)      NOT NULL CONSTRAINT DF_Issues_Status DEFAULT N'Open',
        RaisedBy    NVARCHAR(100)     NULL,
        AssignedTo  NVARCHAR(100)     NULL,
        RaisedAt    DATETIME2         NOT NULL CONSTRAINT DF_Issues_RaisedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2         NOT NULL CONSTRAINT DF_Issues_UpdatedAt DEFAULT SYSUTCDATETIME(),
        ResolvedAt  DATETIME2         NULL,
        CONSTRAINT CK_Issues_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_Issues_App CHECK (App IN (N'HRMS', N'CRM')),
        CONSTRAINT CK_Issues_Priority CHECK (Priority IN (N'Low', N'Medium', N'High', N'Critical')),
        CONSTRAINT CK_Issues_Status CHECK (Status IN (N'Open', N'In Progress', N'Resolved', N'Closed'))
    );

    CREATE INDEX IX_Issues_Status ON dbo.Issues (Status);
    CREATE INDEX IX_Issues_RaisedAt ON dbo.Issues (RaisedAt);
END
GO

-- Upgrade: add the App column to databases created before it existed.
IF COL_LENGTH(N'dbo.Issues', N'App') IS NULL
BEGIN
    ALTER TABLE dbo.Issues ADD App NVARCHAR(20) NOT NULL CONSTRAINT DF_Issues_App DEFAULT N'HRMS'
        CONSTRAINT CK_Issues_App CHECK (App IN (N'HRMS', N'CRM'));
END
GO

IF OBJECT_ID(N'dbo.IssueImages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IssueImages (
        ImageId          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_IssueImages PRIMARY KEY,
        IssueId          INT               NOT NULL,
        ImagePath        NVARCHAR(500)     NOT NULL,
        OriginalFileName NVARCHAR(255)     NULL,
        UploadedAt       DATETIME2         NOT NULL CONSTRAINT DF_IssueImages_UploadedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_IssueImages_Issues FOREIGN KEY (IssueId)
            REFERENCES dbo.Issues (Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_IssueImages_IssueId ON dbo.IssueImages (IssueId);
END
GO
