// Google Workspace Services Integration for Cadence
// Uses client-side OAuth Bearer token obtained from Firebase Auth with Google provider scopes

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/spreadsheets'
];

let inMemoryAccessToken = null;

export function setWorkspaceToken(token) {
  inMemoryAccessToken = token;
}

export function getWorkspaceToken() {
  return inMemoryAccessToken;
}

// 1. Create a Google Doc for Store Visit Summary or Coaching Plan
export async function createGoogleDocReport(title, contentText) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected. Please sign in with Google to enable Drive & Docs export.');
  }

  // Step 1: Create empty document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Failed to create Google Doc');
  }

  const docData = await createRes.json();
  const documentId = docData.documentId;

  // Step 2: Insert formatted text into document
  if (contentText) {
    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${inMemoryAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: contentText + '\n'
            }
          }
        ]
      })
    });

    if (!updateRes.ok) {
      console.warn('Could not populate doc text, empty doc created.');
    }
  }

  return {
    documentId,
    title,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    createdAt: new Date().toISOString()
  };
}

// 2. Create a Google Sheet and Export Store Visit Logs
export async function createGoogleSheetExport(title, headers, rows) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected. Please sign in with Google to enable Google Sheets export.');
  }

  // Step 1: Create empty spreadsheet with configured Visit Logs sheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: title || 'Cadence Store Visit Logs'
      },
      sheets: [
        {
          properties: {
            title: 'Store Visit Log',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Failed to create Google Sheet');
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;

  // Step 2: Populate values (Header + Rows)
  const allValues = [headers, ...rows];
  const valueRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Store Visit Log'!A1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'Store Visit Log'!A1",
      majorDimension: 'ROWS',
      values: allValues
    })
  });

  if (!valueRes.ok) {
    const err = await valueRes.json();
    console.warn('Could not populate sheet values:', err);
  }

  // Step 3: Format Header Row (Executive Charcoal with White text and auto-width columns)
  try {
    const sheetId = sheetData.sheets?.[0]?.properties?.sheetId || 0;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${inMemoryAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.16, green: 0.16, blue: 0.17 },
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 1, green: 1, blue: 1 }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: headers.length
              }
            }
          }
        ]
      })
    });
  } catch (fmtErr) {
    console.warn('Formatting batchUpdate skipped or failed:', fmtErr);
  }

  return {
    spreadsheetId,
    title,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    createdAt: new Date().toISOString()
  };
}

// 3. Add Event to Google Calendar
export async function addEventToCalendar({ title, description, locationName, dateStr, timeStr }) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected. Please sign in with Google.');
  }

  const startDateTime = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

  const eventPayload = {
    summary: title,
    description: description || 'Scheduled dealership visit via Cadence.',
    location: locationName || '',
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventPayload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to add event to Google Calendar');
  }

  return await res.json();
}

// 4. Add Task to Google Tasks
export async function addTaskToGoogleTasks({ title, notes, dueDate }) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected. Please sign in with Google.');
  }

  const taskPayload = {
    title,
    notes: notes || 'Cadence action item'
  };

  if (dueDate) {
    taskPayload.due = new Date(dueDate).toISOString();
  }

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(taskPayload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to create task in Google Tasks');
  }

  return await res.json();
}

// 5. List user's Cadence reports saved in Google Drive (Docs & Sheets)
export async function listCadenceDriveFiles() {
  if (!inMemoryAccessToken) return [];

  try {
    const query = encodeURIComponent("name contains 'Cadence' and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet') and trashed = false");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,webViewLink,createdTime)&orderBy=createdTime desc&pageSize=15`, {
      headers: {
        'Authorization': `Bearer ${inMemoryAccessToken}`
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('Error listing Drive files:', err);
    return [];
  }
}

// 6. List upcoming Calendar events from Google Calendar
export async function listUpcomingCalendarEvents() {
  if (!inMemoryAccessToken) return [];

  try {
    const now = new Date().toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime&maxResults=8`, {
      headers: {
        'Authorization': `Bearer ${inMemoryAccessToken}`
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Error fetching Calendar events:', err);
    return [];
  }
}

// 7. List Tasks from Google Tasks
export async function listUserGoogleTasks() {
  if (!inMemoryAccessToken) return [];

  try {
    const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=15', {
      headers: {
        'Authorization': `Bearer ${inMemoryAccessToken}`
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Error fetching Google Tasks:', err);
    return [];
  }
}

// 8. Delete Drive File (Destructive - requires prior user confirmation)
export async function deleteCadenceDriveFile(fileId) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected.');
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`
    }
  });

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to delete file from Google Drive');
  }

  return true;
}

// 9. Delete Google Calendar Event (Destructive - requires prior user confirmation)
export async function deleteCalendarEvent(eventId) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected.');
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`
    }
  });

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to delete event from Google Calendar');
  }

  return true;
}

// 10. Delete Google Task (Destructive - requires prior user confirmation)
export async function deleteGoogleTask(taskId) {
  if (!inMemoryAccessToken) {
    throw new Error('Google Workspace is not connected.');
  }

  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${inMemoryAccessToken}`
    }
  });

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to delete task from Google Tasks');
  }

  return true;
}
