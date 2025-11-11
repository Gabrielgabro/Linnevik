'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type Product = {
    id: string;
    handle: string;
    title: string;
    images: { edges: { node: { url: string; altText: string | null } }[] };
};

export default function SamplesCheckoutPage() {
    const router = useRouter();
    const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        contactName: '',
        organizationName: '',
        organizationNumber: '',
        email: '',
        phone: '',
        address: '',
        postalCode: '',
        city: '',
        notes: '',
    });

    useEffect(() => {
        const selectedIds = localStorage.getItem('linnevik:sample-selection');
        if (!selectedIds) {
            router.push('/samples');
            return;
        }

        const ids = JSON.parse(selectedIds);
        if (ids.length === 0) {
            router.push('/samples');
            return;
        }

        // Fetch selected products
        fetch('/api/products')
            .then(res => res.json())
            .then((allProducts: Product[]) => {
                const selected = allProducts.filter(p => ids.includes(p.id));
                setSelectedProducts(selected);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load products:', err);
                setLoading(false);
            });
    }, [router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Here you would send the order to your backend
        console.log('Sample order:', {
            products: selectedProducts.map(p => ({ id: p.id, title: p.title })),
            ...formData,
        });

        // Clear selection
        localStorage.removeItem('linnevik:sample-selection');

        alert('Tack för din beställning! Vi skickar proverna till dig inom kort.');
        router.push('/');
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-[#0B3D2E] border-r-transparent dark:border-[#379E7D]" />
                    <p className="mt-4 text-secondary">Laddar...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-6xl mx-auto px-6 pt-32 pb-16">
                {/* Header */}
                <div className="mb-12">
                    <button
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-2 text-secondary hover:text-primary mb-6 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Tillbaka
                    </button>
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        Leveransinformation
                    </h1>
                    <p className="text-lg text-secondary">
                        Fyll i dina uppgifter så skickar vi proverna kostnadsfritt till dig.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-12">
                    {/* Form */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* Contact Information */}
                            <div className="space-y-6">
                                <h2 className="text-xl font-bold text-primary border-b border-[#E7EDF1] dark:border-[#374151] pb-3">
                                    Kontaktperson
                                </h2>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label htmlFor="contactName" className="block text-sm font-medium text-primary">
                                            Namn *
                                        </label>
                                        <input
                                            type="text"
                                            id="contactName"
                                            name="contactName"
                                            required
                                            value={formData.contactName}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="För- och efternamn"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="phone" className="block text-sm font-medium text-primary">
                                            Telefon *
                                        </label>
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            required
                                            value={formData.phone}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="+46 70 123 45 67"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="email" className="block text-sm font-medium text-primary">
                                        E-post *
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        required
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                        placeholder="din@email.se"
                                    />
                                </div>
                            </div>

                            {/* Organization */}
                            <div className="space-y-6">
                                <h2 className="text-xl font-bold text-primary border-b border-[#E7EDF1] dark:border-[#374151] pb-3">
                                    Organisation
                                </h2>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label htmlFor="organizationName" className="block text-sm font-medium text-primary">
                                            Organisationsnamn *
                                        </label>
                                        <input
                                            type="text"
                                            id="organizationName"
                                            name="organizationName"
                                            required
                                            value={formData.organizationName}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="Företagets namn"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="organizationNumber" className="block text-sm font-medium text-primary">
                                            Organisationsnummer *
                                        </label>
                                        <input
                                            type="text"
                                            id="organizationNumber"
                                            name="organizationNumber"
                                            required
                                            value={formData.organizationNumber}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="XXXXXX-XXXX"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Delivery Address */}
                            <div className="space-y-6">
                                <h2 className="text-xl font-bold text-primary border-b border-[#E7EDF1] dark:border-[#374151] pb-3">
                                    Leveransadress
                                </h2>

                                <div className="space-y-2">
                                    <label htmlFor="address" className="block text-sm font-medium text-primary">
                                        Gatuadress *
                                    </label>
                                    <input
                                        type="text"
                                        id="address"
                                        name="address"
                                        required
                                        value={formData.address}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                        placeholder="Gata och nummer"
                                    />
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label htmlFor="postalCode" className="block text-sm font-medium text-primary">
                                            Postnummer *
                                        </label>
                                        <input
                                            type="text"
                                            id="postalCode"
                                            name="postalCode"
                                            required
                                            value={formData.postalCode}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="123 45"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="city" className="block text-sm font-medium text-primary">
                                            Ort *
                                        </label>
                                        <input
                                            type="text"
                                            id="city"
                                            name="city"
                                            required
                                            value={formData.city}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                            placeholder="Stad"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="notes" className="block text-sm font-medium text-primary">
                                        Meddelande <span className="text-secondary">(valfritt)</span>
                                    </label>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        rows={4}
                                        value={formData.notes}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors resize-none"
                                        placeholder="Övriga kommentarer eller önskemål..."
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="w-full bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                            >
                                Skicka beställning
                            </button>
                        </form>
                    </div>

                    {/* Order Summary */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-32 bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                            <h2 className="text-xl font-bold text-primary mb-4">
                                Valda prover ({selectedProducts.length})
                            </h2>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {selectedProducts.map((product) => {
                                    const image = product.images.edges[0]?.node;
                                    return (
                                        <div key={product.id} className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-[#111827]">
                                            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#F9FAFB] dark:bg-[#1f2937]">
                                                {image ? (
                                                    <Image
                                                        src={image.url}
                                                        alt={image.altText ?? product.title}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-[#E7EDF1] dark:bg-[#374151]" />
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-primary flex-1 line-clamp-2">
                                                {product.title}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-6 pt-6 border-t border-[#E7EDF1] dark:border-[#374151]">
                                <div className="flex items-center gap-2 text-sm text-[#0B3D2E] dark:text-[#379E7D]">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="font-semibold">Kostnadsfri leverans</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
