-- New joiners (employees). Columns follow the HR new-joiner sheet.
-- Guarded with IF ... IS NULL so it is a no-op on databases created by the old schema.sql.

-- The filtered unique index below needs these settings.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employees (
        Id                    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
        CreationDate          DATE              NULL,
        Unit                  NVARCHAR(50)      NULL,
        DisplayName           NVARCHAR(100)     NOT NULL,
        EmployeeLevel         NVARCHAR(30)      NULL,
        Email                 NVARCHAR(200)     NULL,
        DateOfJoining         DATE              NULL,
        Designation           NVARCHAR(100)     NULL,
        BaseLocation          NVARCHAR(200)     NULL,
        Department            NVARCHAR(100)     NULL,
        ReportingTo           NVARCHAR(100)     NULL,
        MobilePersonal        NVARCHAR(20)      NULL,
        MobileOfficial        NVARCHAR(20)      NULL,
        SystemRequirement     NVARCHAR(100)     NULL,
        CorrespondenceAddress NVARCHAR(500)     NULL,
        Status                NVARCHAR(20)      NOT NULL CONSTRAINT DF_Employees_Status DEFAULT N'Active',
        CreatedAt             DATETIME2         NOT NULL CONSTRAINT DF_Employees_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt             DATETIME2         NOT NULL CONSTRAINT DF_Employees_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Employees_DisplayName CHECK (LEN(LTRIM(RTRIM(DisplayName))) > 0),
        CONSTRAINT CK_Employees_Status CHECK (Status IN (N'Active', N'Inactive'))
    );

    -- Email is optional but must be unique when present (the Excel import matches on it).
    CREATE UNIQUE INDEX UX_Employees_Email ON dbo.Employees (Email) WHERE Email IS NOT NULL;
    CREATE INDEX IX_Employees_DateOfJoining ON dbo.Employees (DateOfJoining);
END
GO
