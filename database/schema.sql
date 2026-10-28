/*
  Issue Tracker - SQL Server database script
  Run this once in SSMS (File > Open > File..., then Execute / F5).
  All timestamps are stored in UTC (SYSUTCDATETIME); the browser shows them in local time.
*/

IF DB_ID(N'IssueTrackerDB') IS NULL
    CREATE DATABASE IssueTrackerDB;
GO

USE IssueTrackerDB;
GO

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

/* ---------------- Training Records ---------------- */

IF OBJECT_ID(N'dbo.TrainingSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingSessions (
        Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TrainingSessions PRIMARY KEY,
        Title     NVARCHAR(200)     NOT NULL,
        StartAt   DATETIME2         NOT NULL,
        EndAt     DATETIME2         NULL,
        Mode        NVARCHAR(20)    NOT NULL CONSTRAINT DF_TrainingSessions_Mode DEFAULT N'F2F',
        Location    NVARCHAR(200)   NULL,
        MeetingLink NVARCHAR(500)   NULL,
        Status    NVARCHAR(20)      NOT NULL CONSTRAINT DF_TrainingSessions_Status DEFAULT N'Scheduled',
        Notes     NVARCHAR(MAX)     NULL,
        CreatedAt DATETIME2         NOT NULL CONSTRAINT DF_TrainingSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2         NOT NULL CONSTRAINT DF_TrainingSessions_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_TrainingSessions_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_TrainingSessions_Status CHECK (Status IN (N'Scheduled', N'Completed', N'Cancelled')),
        CONSTRAINT CK_TrainingSessions_Mode CHECK (Mode IN (N'F2F', N'Online')),
        CONSTRAINT CK_TrainingSessions_EndAt CHECK (EndAt IS NULL OR EndAt >= StartAt)
    );

    CREATE INDEX IX_TrainingSessions_StartAt ON dbo.TrainingSessions (StartAt);
END
GO

-- Upgrade: add training mode and meeting link to databases created before they existed.
IF COL_LENGTH(N'dbo.TrainingSessions', N'Mode') IS NULL
BEGIN
    ALTER TABLE dbo.TrainingSessions ADD Mode NVARCHAR(20) NOT NULL CONSTRAINT DF_TrainingSessions_Mode DEFAULT N'F2F'
        CONSTRAINT CK_TrainingSessions_Mode CHECK (Mode IN (N'F2F', N'Online'));
END
GO

IF COL_LENGTH(N'dbo.TrainingSessions', N'MeetingLink') IS NULL
BEGIN
    ALTER TABLE dbo.TrainingSessions ADD MeetingLink NVARCHAR(500) NULL;
END
GO

IF OBJECT_ID(N'dbo.TrainingSessionTrainers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingSessionTrainers (
        SessionId   INT           NOT NULL,
        TrainerName NVARCHAR(100) NOT NULL,
        CONSTRAINT PK_TrainingSessionTrainers PRIMARY KEY (SessionId, TrainerName),
        CONSTRAINT FK_TrainingSessionTrainers_Sessions FOREIGN KEY (SessionId)
            REFERENCES dbo.TrainingSessions (Id) ON DELETE CASCADE
    );
END
GO

-- One row per employee per app trained in a session.
IF OBJECT_ID(N'dbo.TrainingAttendees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingAttendees (
        AttendeeId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TrainingAttendees PRIMARY KEY,
        SessionId    INT               NOT NULL,
        EmployeeName NVARCHAR(100)     NOT NULL,
        EmployeeCode NVARCHAR(50)      NULL,
        Department   NVARCHAR(100)     NULL,
        App          NVARCHAR(20)      NOT NULL,
        CONSTRAINT CK_TrainingAttendees_App CHECK (App IN (N'HRMS', N'CRM')),
        CONSTRAINT FK_TrainingAttendees_Sessions FOREIGN KEY (SessionId)
            REFERENCES dbo.TrainingSessions (Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_TrainingAttendees_SessionId ON dbo.TrainingAttendees (SessionId);
    CREATE INDEX IX_TrainingAttendees_EmployeeName ON dbo.TrainingAttendees (EmployeeName);
END
GO

-- Which of the session's trainers trained each attendee.
IF OBJECT_ID(N'dbo.TrainingAttendeeTrainers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingAttendeeTrainers (
        AttendeeId  INT           NOT NULL,
        TrainerName NVARCHAR(100) NOT NULL,
        CONSTRAINT PK_TrainingAttendeeTrainers PRIMARY KEY (AttendeeId, TrainerName),
        CONSTRAINT FK_TrainingAttendeeTrainers_Attendees FOREIGN KEY (AttendeeId)
            REFERENCES dbo.TrainingAttendees (AttendeeId) ON DELETE CASCADE
    );

    CREATE INDEX IX_TrainingAttendeeTrainers_TrainerName ON dbo.TrainingAttendeeTrainers (TrainerName);
END
GO

IF OBJECT_ID(N'dbo.TrainingImages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingImages (
        ImageId          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TrainingImages PRIMARY KEY,
        SessionId        INT               NOT NULL,
        ImagePath        NVARCHAR(500)     NOT NULL,
        OriginalFileName NVARCHAR(255)     NULL,
        UploadedAt       DATETIME2         NOT NULL CONSTRAINT DF_TrainingImages_UploadedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_TrainingImages_Sessions FOREIGN KEY (SessionId)
            REFERENCES dbo.TrainingSessions (Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_TrainingImages_SessionId ON dbo.TrainingImages (SessionId);
END
GO

/*
  Optional: a dedicated SQL login for the app (SQL Server Authentication).
  Requires "SQL Server and Windows Authentication mode" to be enabled on the server
  (SSMS > right-click server > Properties > Security), followed by a service restart.
  Uncomment, change the password, and run:

USE master;
GO
CREATE LOGIN issue_tracker_app WITH PASSWORD = N'ChangeThis!Str0ngPassword', CHECK_POLICY = ON;
GO
USE IssueTrackerDB;
GO
CREATE USER issue_tracker_app FOR LOGIN issue_tracker_app;
ALTER ROLE db_datareader ADD MEMBER issue_tracker_app;
ALTER ROLE db_datawriter ADD MEMBER issue_tracker_app;
GO
*/
