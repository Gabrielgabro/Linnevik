# SMTP Configuration Guide for Linnevik

This guide explains how to configure email notifications for the contact form and sample request system.

## 1. Prerequisites

You need an Outlook/Microsoft account to send emails. We'll use `Gabriel.1440.g@outlook.com` as the sender.

## 2. Generate an App Password

Since you likely have Two-Factor Authentication (2FA) enabled (or for better security), you should use an **App Password** instead of your regular password.

1. Go to [Microsoft Account Security](https://account.microsoft.com/security)
2. Click on **"Advanced security options"**
3. Scroll down to **"App passwords"**
4. Click **"Create a new app password"**
5. Copy the generated password (it will look like a random string of characters)

> **Note:** If you don't see "App passwords", you might need to enable Two-Step Verification first in the same "Advanced security options" section.

## 3. Configure Environment Variables

1. Create a file named `.env.local` in the `web` directory (if it doesn't exist).
2. Add the following lines to it:

```env
# SMTP Configuration
SMTP_USER=Gabriel.1440.g@outlook.com
SMTP_PASS=your-generated-app-password-here
```

Replace `your-generated-app-password-here` with the password you copied in Step 2.

## 4. Testing

1. Restart your development server:
   ```bash
   npm run dev
   ```
2. Go to the Contact page (`/contact`)
3. Fill out the form and submit
4. Check your Outlook inbox for the notification

## Troubleshooting

- **Error: Authentication unsuccessful**: Double-check your email and App Password. Make sure you didn't include any spaces.
- **Error: Connection timeout**: Check your internet connection. Sometimes firewalls block port 587.
- **Emails going to Spam**: Since we're sending *from* and *to* the same Outlook address, this is rare, but check your Junk folder just in case. Mark as "Not Junk" if found there.
