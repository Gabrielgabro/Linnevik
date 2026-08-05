import { SITE_EMAIL, SITE_LOGO_URL, SITE_NAME, SITE_TELEPHONE, SITE_URL } from '@/lib/site';

type Props = {
  locale: 'sv' | 'en';
};

export default function OrganizationJsonLd({ locale }: Props) {
  const description = locale === 'sv'
    ? 'Linnevik levererar hållbara textilier och skräddarsydda produkter för hotell.'
    : 'Linnevik supplies durable textiles and bespoke products for hotels.';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: 'Linneviken AB',
    url: SITE_URL,
    logo: SITE_LOGO_URL,
    description,
    foundingDate: '1986',
    email: SITE_EMAIL,
    telephone: SITE_TELEPHONE,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Himmelsbodavägen 15',
      postalCode: '147 39',
      addressLocality: 'Tumba',
      addressCountry: 'SE',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: SITE_EMAIL,
      telephone: SITE_TELEPHONE,
      availableLanguage: ['Swedish', 'English'],
    },
    parentOrganization: {
      '@type': 'Organization',
      name: 'Södra Vanadistvätten AB',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}
