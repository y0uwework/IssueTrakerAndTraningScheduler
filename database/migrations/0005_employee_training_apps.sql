-- The apps each new joiner has to be trained on (chosen per joiner; not every joiner needs every app).
-- An app that isn't listed here shows as "Not required" unless the joiner already has a training record for it.

IF OBJECT_ID(N'dbo.EmployeeTrainingApps', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmployeeTrainingApps (
        EmployeeId INT          NOT NULL CONSTRAINT FK_EmployeeTrainingApps_Employee REFERENCES dbo.Employees (Id) ON DELETE CASCADE,
        App        NVARCHAR(20) NOT NULL,
        CONSTRAINT PK_EmployeeTrainingApps PRIMARY KEY (EmployeeId, App)
    );
END
GO

-- Until now every joiner needed every app, so existing joiners keep the apps that were in use:
-- every app that appears in any training session. Untick apps per joiner as needed.
INSERT INTO dbo.EmployeeTrainingApps (EmployeeId, App)
SELECT e.Id, x.App
FROM dbo.Employees e
CROSS JOIN (
    SELECT App FROM dbo.TrainingAttendees
    UNION
    SELECT App FROM dbo.TrainingSessionTrainers
) x
WHERE NOT EXISTS (SELECT 1 FROM dbo.EmployeeTrainingApps t WHERE t.EmployeeId = e.Id AND t.App = x.App);
GO
