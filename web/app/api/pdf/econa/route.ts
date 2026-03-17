import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        const econaDir = path.join(process.cwd(), 'app', '[locale]', 'Econa');
        const files = await readdir(econaDir);
        const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));

        if (!pdfFile) {
            return NextResponse.json({ error: 'No PDF found in Econa folder' }, { status: 404 });
        }

        const filePath = path.join(econaDir, pdfFile);
        const fileBuffer = await readFile(filePath);

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }
}
