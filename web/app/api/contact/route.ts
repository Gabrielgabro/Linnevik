import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, company, email, phone, message } = body;

        // Validate required fields
        if (!name || !email || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create email HTML
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0B3D2E; border-bottom: 2px solid #0B3D2E; padding-bottom: 10px;">
                    New Contact Form Submission
                </h2>
                <p style="color: #666; margin-bottom: 20px;">
                    You have received a new message from the Linnevik.se contact form.
                </p>
                
                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Contact Information</h3>
                    <p style="margin: 8px 0;"><strong>Name:</strong> ${name}</p>
                    ${company ? `<p style="margin: 8px 0;"><strong>Company:</strong> ${company}</p>` : ''}
                    <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    ${phone ? `<p style="margin: 8px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
                </div>

                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Message</h3>
                    <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
                </div>

                <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                    This email was sent from the contact form on Linnevik.se
                </p>
            </div>
        `;

        // Send email
        const result = await sendEmail({
            to: process.env.SMTP_USER || 'Gabriel.1440.g@outlook.com',
            subject: `New Contact Form Submission from ${name}`,
            html: emailHtml,
            replyTo: email,
        });

        if (result.success) {
            return NextResponse.json({ success: true });
        } else {
            console.error('Failed to send email:', result.error);
            return NextResponse.json(
                { error: 'Failed to send email' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Error processing contact form:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
