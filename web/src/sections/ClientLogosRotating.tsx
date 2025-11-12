import fs from 'fs/promises';
import path from 'path';
import ClientLogosRotatingClient from './ClientLogosRotatingClient';

type Logo = { src: string; alt: string };

function toTitle(file: string) {
    const name = file.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ');
    return name.replace(/\b\w/g, (match) => match.toUpperCase());
}

async function readLogos(folder: string): Promise<Logo[]> {
    const dir = path.join(process.cwd(), 'public', folder);
    try {
        const files = await fs.readdir(dir);
        return files
            .filter((file) => /\.(svg|png|jpe?g)$/i.test(file))
            .map((file) => ({
                src: `/${folder}/${file}`,
                alt: toTitle(file),
            }));
    } catch {
        return [];
    }
}

export default async function ClientLogosRotating() {
    const lightLogos = await readLogos('client_logos');
    const darkLogos = await readLogos('client_logo_darkmode');

    if (!lightLogos.length && !darkLogos.length) {
        return null;
    }

    return <ClientLogosRotatingClient lightLogos={lightLogos} darkLogos={darkLogos} />;
}
