import fs from 'fs/promises';
import path from 'path';
import ClientLogosRotatingClient from './ClientLogosRotatingClient';

type Logo = { src: string; alt: string };

function toTitle(file: string) {
    const name = file.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ');
    return name.replace(/\b\w/g, (match) => match.toUpperCase());
}

async function readLogos(): Promise<Logo[]> {
    const dir = path.join(process.cwd(), 'public', 'client_logos');
    try {
        const files = await fs.readdir(dir);
        return files
            .filter((file) => /\.(svg|png|jpe?g)$/i.test(file))
            .map((file) => ({
                src: `/client_logos/${file}`,
                alt: toTitle(file),
            }));
    } catch {
        return [];
    }
}

export default async function ClientLogosRotating() {
    const logos = await readLogos();
    if (!logos.length) {
        return null;
    }

    return <ClientLogosRotatingClient logos={logos} />;
}
