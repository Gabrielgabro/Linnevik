'use client';

import { useState } from 'react';

export default function ContactPage() {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        message: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Handle form submission
        console.log('Form submitted:', formData);
        alert('Tack för ditt meddelande! Vi återkommer inom kort.');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            {/* Hero Section */}
            <section className="pt-32 pb-16 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-block mb-4">
                        <span className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                            Kontakt
                        </span>
                    </div>
                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-primary mb-6">
                        Hör av dig
                    </h1>
                    <p className="text-xl text-secondary max-w-2xl mx-auto leading-relaxed">
                        Har du några frågor? Kom förbi på en kaffe! Det går förstås bra att mejla eller ringa oss också.
                    </p>
                </div>
            </section>

            {/* Form and Info Section */}
            <section className="pb-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
                        {/* Contact Info Sidebar */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Address */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                                    Besöksadress
                                </h3>
                                <p className="text-lg text-primary font-medium">
                                    Södra Vanadistvätten AB<br />
                                    Himmelsbodavägen 15 <br />
                                    147 39 Tumba
                                </p>
                            </div>

                            {/* Contact Details */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                                    Kontaktuppgifter
                                </h3>
                                <div className="space-y-2">
                                    <a
                                        href="mailto:info@linnevik.se"
                                        className="flex items-center gap-3 text-primary hover:text-[#0B3D2E] dark:hover:text-[#379E7D] transition-colors group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#D9F0E8] dark:bg-[#0B3D2E] flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <svg className="w-5 h-5 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="font-medium">info@linnevik.se</span>
                                    </a>
                                    <a
                                        href="tel:+46812345678"
                                        className="flex items-center gap-3 text-primary hover:text-[#0B3D2E] dark:hover:text-[#379E7D] transition-colors group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#D9F0E8] dark:bg-[#0B3D2E] flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <svg className="w-5 h-5 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                        </div>
                                        <span className="font-medium">+46 8 123 456 78</span>
                                    </a>
                                </div>
                            </div>

                            {/* Opening Hours */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                                    Öppettider
                                </h3>
                                <div className="space-y-2 text-secondary">
                                    <div className="flex justify-between">
                                        <span>Måndag - Fredag</span>
                                        <span className="font-medium text-primary">09:00 - 17:00</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Lördag - Söndag</span>
                                        <span className="font-medium text-primary">Stängt</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact Form */}
                        <div className="lg:col-span-3">
                            <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-3xl p-8 md:p-12 border border-[#E7EDF1] dark:border-[#374151]">
                                <h2 className="text-2xl font-bold text-primary mb-2">
                                    Fyll i dina uppgifter, så kontaktar vi dig inom kort.
                                </h2>
                                <p className="text-secondary mb-8">
                                    Vi svarar vanligtvis inom 24 timmar.
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Name */}
                                        <div className="space-y-2">
                                            <label htmlFor="name" className="block text-sm font-medium text-primary">
                                                Namn
                                            </label>
                                            <input
                                                type="text"
                                                id="name"
                                                name="name"
                                                required
                                                value={formData.name}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-white dark:bg-[#111827] text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                                placeholder="Ditt namn"
                                            />
                                        </div>

                                        {/* Company */}
                                        <div className="space-y-2">
                                            <label htmlFor="company" className="block text-sm font-medium text-primary">
                                                Företag <span className="text-secondary">(valfritt)</span>
                                            </label>
                                            <input
                                                type="text"
                                                id="company"
                                                name="company"
                                                value={formData.company}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-white dark:bg-[#111827] text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                                placeholder="Företagsnamn"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Email */}
                                        <div className="space-y-2">
                                            <label htmlFor="email" className="block text-sm font-medium text-primary">
                                                E-post
                                            </label>
                                            <input
                                                type="email"
                                                id="email"
                                                name="email"
                                                required
                                                value={formData.email}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-white dark:bg-[#111827] text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                                placeholder="din@email.se"
                                            />
                                        </div>

                                        {/* Phone */}
                                        <div className="space-y-2">
                                            <label htmlFor="phone" className="block text-sm font-medium text-primary">
                                                Telefon <span className="text-secondary">(valfritt)</span>
                                            </label>
                                            <input
                                                type="tel"
                                                id="phone"
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-white dark:bg-[#111827] text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors"
                                                placeholder="+46 70 123 45 67"
                                            />
                                        </div>
                                    </div>

                                    {/* Message */}
                                    <div className="space-y-2">
                                        <label htmlFor="message" className="block text-sm font-medium text-primary">
                                            Meddelande
                                        </label>
                                        <textarea
                                            id="message"
                                            name="message"
                                            required
                                            rows={6}
                                            value={formData.message}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-white dark:bg-[#111827] text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#379E7D] transition-colors resize-none"
                                            placeholder="Berätta hur vi kan hjälpa dig..."
                                        />
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        className="w-full md:w-auto bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                                    >
                                        Skicka meddelande
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Map Section (Optional) */}
            <section className="pb-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="aspect-[16/9] md:aspect-[21/9] rounded-3xl overflow-hidden bg-[#F9FAFB] dark:bg-[#1f2937] border border-[#E7EDF1] dark:border-[#374151]">
                        {/* Placeholder for Google Maps or similar */}
                        <div className="w-full h-full flex items-center justify-center text-secondary">
                            [Karta - Google Maps integration]
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
