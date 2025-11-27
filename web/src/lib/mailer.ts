import nodemailer from 'nodemailer';

// Create reusable transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: EmailOptions) {
    try {
        const info = await transporter.sendMail({
            from: `"Linnevik Website" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            replyTo,
        });

        console.log('Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error };
    }
}
