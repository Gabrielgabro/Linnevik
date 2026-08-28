'use client';

import { useActionState } from 'react';
import { handleRegister, type RegisterState } from '../actions';
import Button from '@/components/Button';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

const initialState: RegisterState = { status: 'idle' };

const fieldClass =
    'w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30';

export default function CreateAccountClient() {
    const [state, formAction, isPending] = useActionState(handleRegister, initialState);
    const formKey = state.fields ? JSON.stringify(state.fields) : 'initial';
    const { t } = useTranslation();

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16">
            <div className="mx-auto max-w-md px-6">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.register.title}
                    </h1>
                    <p className="text-secondary">{t.register.subtitle}</p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    {state.status === 'success' && state.message && (
                        <div className="mb-6 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                            {state.message}
                        </div>
                    )}

                    {state.status === 'error' && state.message && (
                        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                            {state.message}
                        </div>
                    )}

                    <form key={formKey} action={formAction} className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="firstName" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.firstNameLabel}
                                </label>
                                <input
                                    id="firstName"
                                    name="firstName"
                                    type="text"
                                    autoComplete="given-name"
                                    required
                                    maxLength={100}
                                    className={fieldClass}
                                    placeholder={t.register.firstNamePlaceholder}
                                    defaultValue={state.fields?.firstName ?? ''}
                                />
                            </div>

                            <div>
                                <label htmlFor="lastName" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.lastNameLabel}
                                </label>
                                <input
                                    id="lastName"
                                    name="lastName"
                                    type="text"
                                    autoComplete="family-name"
                                    required
                                    maxLength={100}
                                    className={fieldClass}
                                    placeholder={t.register.lastNamePlaceholder}
                                    defaultValue={state.fields?.lastName ?? ''}
                                />
                            </div>
                        </div>

                        {/* Rollen och telefonnumret hör till personen, inte till
                            företaget. Båda frivilliga: de gör kontakten användbar
                            för säljet, men ingen registrering ska falla på dem. */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="role" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.roleLabel}
                                </label>
                                <input
                                    id="role"
                                    name="role"
                                    type="text"
                                    autoComplete="organization-title"
                                    maxLength={120}
                                    className={fieldClass}
                                    placeholder={t.register.rolePlaceholder}
                                    defaultValue={state.fields?.role ?? ''}
                                />
                            </div>

                            <div>
                                <label htmlFor="phone" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.phoneLabel}
                                </label>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="tel"
                                    autoComplete="tel"
                                    maxLength={40}
                                    className={fieldClass}
                                    placeholder={t.register.phonePlaceholder}
                                    defaultValue={state.fields?.phone ?? ''}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="companyName" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.companyNameLabel}
                            </label>
                            <input
                                id="companyName"
                                name="companyName"
                                type="text"
                                autoComplete="organization"
                                required
                                maxLength={120}
                                className={fieldClass}
                                placeholder={t.register.companyNamePlaceholder}
                                defaultValue={state.fields?.companyName ?? ''}
                            />
                        </div>

                        <div>
                            <label htmlFor="companyRegistrationNumber" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.companyLabel}
                            </label>
                            <input
                                id="companyRegistrationNumber"
                                name="companyRegistrationNumber"
                                type="text"
                                autoComplete="off"
                                required
                                pattern="[A-Za-z0-9 .-]{4,24}"
                                maxLength={24}
                                className={fieldClass}
                                placeholder={t.register.companyPlaceholder}
                                title={t.register.companyHelper}
                                defaultValue={state.fields?.companyRegistrationNumber ?? ''}
                            />
                            <p className="mt-2 text-sm text-secondary">{t.register.companyHelper}</p>
                        </div>

                        {/* Faktureringsadressen. Frågas här för att en faktura ska
                            kunna skapas utan ett extra varv i kassan. */}
                        <div>
                            <label htmlFor="addressLine1" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.addressLabel}
                            </label>
                            <input
                                id="addressLine1"
                                name="addressLine1"
                                type="text"
                                autoComplete="street-address"
                                required
                                maxLength={120}
                                className={fieldClass}
                                placeholder={t.register.addressPlaceholder}
                                defaultValue={state.fields?.addressLine1 ?? ''}
                            />
                        </div>

                        <div>
                            <label htmlFor="addressLine2" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.addressLine2Label}
                            </label>
                            <input
                                id="addressLine2"
                                name="addressLine2"
                                type="text"
                                autoComplete="address-line2"
                                maxLength={120}
                                className={fieldClass}
                                defaultValue={state.fields?.addressLine2 ?? ''}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="postalCode" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.postalCodeLabel}
                                </label>
                                <input
                                    id="postalCode"
                                    name="postalCode"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="postal-code"
                                    required
                                    maxLength={16}
                                    className={fieldClass}
                                    placeholder={t.register.postalCodePlaceholder}
                                    defaultValue={state.fields?.postalCode ?? ''}
                                />
                            </div>

                            <div>
                                <label htmlFor="city" className="block mb-2 text-sm font-medium text-primary">
                                    {t.register.cityLabel}
                                </label>
                                <input
                                    id="city"
                                    name="city"
                                    type="text"
                                    autoComplete="address-level2"
                                    required
                                    maxLength={120}
                                    className={fieldClass}
                                    placeholder={t.register.cityPlaceholder}
                                    defaultValue={state.fields?.city ?? ''}
                                />
                            </div>
                        </div>
                        <p className="-mt-2 text-sm text-secondary">{t.register.addressHelper}</p>

                        <div>
                            <label htmlFor="email" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.emailLabel}
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                                className={fieldClass}
                                placeholder={t.register.emailPlaceholder}
                                defaultValue={state.fields?.email ?? ''}
                            />
                            <p className="mt-2 text-sm text-secondary">
                                {t.register.emailHelper}
                            </p>
                        </div>

                        <div className="space-y-3 pt-2">
                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full text-center"
                                disabled={isPending}
                            >
                                {isPending ? t.register.submitting : t.register.submit}
                            </Button>
                            <LocaleLink
                                href="/login"
                                className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                            >
                                {t.register.backToLogin}
                            </LocaleLink>
                        </div>
                    </form>
                </div>

                <p className="mt-6 text-xs text-secondary text-center">
                    {t.register.terms}
                </p>
            </div>
        </main>
    );
}
