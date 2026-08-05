export const SITE_URL = 'https://www.linnevik.se';

export const SITE_NAME = 'Linnevik';
export const SITE_EMAIL = 'info@linnevik.se';
export const SITE_TELEPHONE = '+46738970239';
export const SITE_LOGO_URL = `${SITE_URL}/brand/logo_in_black.svg`;

export function getSiteUrl(path = '') {
  const normalizedPath = path === '/' ? '' : path.replace(/^\/+/, '');
  return normalizedPath ? `${SITE_URL}/${normalizedPath}` : SITE_URL;
}
