-- Training records: sessions, per-app trainers, attendees, and photos.
-- Guarded with IF ... IS NULL so it is a no-op on databases created by the old schema.sql.

IF OBJECT_ID(N'dbo.TrainingSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingSessions (
        Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TrainingSessions PRIMARY KEY,
        Title       NVARCHAR(200)     NOT NULL,
        StartAt     DATETIME2         NULL, -- NULL only for records imported from the old sheet without a date
        EndAt       DATETIME2         NULL,
        Mode        NVARCHAR(20)      NOT NULL CONSTRAINT DF_TrainingSessions_Mode DEFAULT N'F2F',
        Location    NVARCHAR(200)     NULL,
        MeetingLink NVARCHAR(500)     NULL,
        Status      NVARCHAR(20)      NOT NULL CONSTRAINT DF_TrainingSessions_Status DEFAULT N'Scheduled',
        Notes       NVARCHAR(MAX)     NULL,
        CreatedAt   DATETIME2         NOT NULL CONSTRAINT DF_TrainingSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2         NOT NULL CONSTRAINT DF_TrainingSessions_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_TrainingSessions_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_TrainingSessions_Status CHECK (Status IN (N'Scheduled', N'Completed', N'Cancelled')),
        CONSTRAINT CK_TrainingSessions_Mode CHECK (Mode IN (N'F2F', N'Online')),
        CONSTRAINT CK_TrainingSessions_EndAt CHECK (EndAt IS NULL OR (StartAt IS NOT NULL AND EndAt >= StartAt))
    );

    CREATE INDEX IX_TrainingSessions_StartAt ON dbo.TrainingSessions (StartAt);
END
GO

-- Upgrade: allow an empty start date (old-sheet records without a date). The index and the
-- check constraint use the column, so they are dropped and re-created around the change.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TrainingSessions') AND name = N'StartAt' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TrainingSessions') AND name = N'IX_TrainingSessions_StartAt')
        DROP INDEX IX_TrainingSessions_StartAt ON dbo.TrainingSessions;
    IF OBJECT_ID(N'dbo.CK_TrainingSessions_EndAt', N'C') IS NOT NULL
        ALTER TABLE dbo.TrainingSessions DROP CONSTRAINT CK_TrainingSessions_EndAt;
    ALTER TABLE dbo.TrainingSessions ALTER COLUMN StartAt DATETIME2 NULL;
    ALTER TABLE dbo.TrainingSessions ADD CONSTRAINT CK_TrainingSessions_EndAt CHECK (EndAt IS NULL OR (StartAt IS NOT NULL AND EndAt >= StartAt));
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

-- Trainers are assigned per app: a session can have different trainers for HRMS and CRM.
IF OBJECT_ID(N'dbo.TrainingSessionTrainers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingSessionTrainers (
        SessionId   INT           NOT NULL,
        App         NVARCHAR(20)  NOT NULL,
        TrainerName NVARCHAR(100) NOT NULL,
        CONSTRAINT PK_TrainingSessionTrainers PRIMARY KEY (SessionId, App, TrainerName),
        CONSTRAINT CK_TrainingSessionTrainers_App CHECK (App IN (N'HRMS', N'CRM')),
        CONSTRAINT FK_TrainingSessionTrainers_Sessions FOREIGN KEY (SessionId)
            REFERENCES dbo.TrainingSessions (Id) ON DELETE CASCADE
    );
END
GO

-- One row per new joiner per app trained in a session.
IF OBJECT_ID(N'dbo.TrainingAttendees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrainingAttendees (
        AttendeeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TrainingAttendees PRIMARY KEY,
        SessionId  INT               NOT NULL,
        EmployeeId INT               NOT NULL,
        App        NVARCHAR(20)      NOT NULL,
        CONSTRAINT CK_TrainingAttendees_App CHECK (App IN (N'HRMS', N'CRM')),
        CONSTRAINT UQ_TrainingAttendees UNIQUE (SessionId, EmployeeId, App),
        CONSTRAINT FK_TrainingAttendees_Sessions FOREIGN KEY (SessionId)
            REFERENCES dbo.TrainingSessions (Id) ON DELETE CASCADE,
        -- No cascade: an employee with training records cannot be deleted (mark them Inactive instead).
        CONSTRAINT FK_TrainingAttendees_Employees FOREIGN KEY (EmployeeId)
            REFERENCES dbo.Employees (Id)
    );

    CREATE INDEX IX_TrainingAttendees_EmployeeId ON dbo.TrainingAttendees (EmployeeId);
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
