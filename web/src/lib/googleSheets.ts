import { google } from 'googleapis';

export async function appendVisitLog(data: string[]) {
    try {
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const sheetId = process.env.GOOGLE_SHEET_ID;

        if (!serviceAccountEmail || !privateKey || !sheetId) {
            console.error('Missing Google Sheets credentials');
            return;
        }

        const auth = new google.auth.JWT(
            serviceAccountEmail,
            undefined,
            privateKey,
            ['https://www.googleapis.com/auth/spreadsheets']
        );

        const sheets = google.sheets({ version: 'v4', auth });

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:E', // Adjust range as needed, assuming 5 columns (Time, User Agent, Country, Region, City)
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [data],
            },
        });
    } catch (error) {
        console.error('Error logging to Google Sheets:', error);
    }
}
