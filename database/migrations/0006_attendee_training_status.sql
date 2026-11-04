-- Per-employee training progress: each attendee row is "Going on" until marked "Completed",
-- and CompletedAt records when that employee's training ended.

IF COL_LENGTH(N'dbo.TrainingAttendees', N'Status') IS NULL
BEGIN
    ALTER TABLE dbo.TrainingAttendees ADD
        Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TrainingAttendees_Status DEFAULT N'Going on'
            CONSTRAINT CK_TrainingAttendees_Status CHECK (Status IN (N'Going on', N'Completed')),
        CompletedAt DATETIME2 NULL;
END
GO

-- Attendees of sessions that were already completed are completed too, ending when the session ended.
UPDATE a
SET Status = N'Completed', CompletedAt = COALESCE(s.EndAt, s.StartAt, s.UpdatedAt)
FROM dbo.TrainingAttendees a
JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
WHERE s.Status = N'Completed' AND a.Status <> N'Completed';
GO
