import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            contactName,
            organizationName,
            organizationNumber,
            email,
            phone,
            address,
            postalCode,
            city,
            country,
            notes,
            products,
        } = body;

        // Validate required fields
        if (!contactName || !organizationName || !organizationNumber || !email || !phone || !address || !postalCode || !city || !country) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create products list HTML
        const productsHtml = products && products.length > 0
            ? products.map((p: { title: string; id: string; variant?: string }) => {
                const variantText = p.variant ? ` <span style="color: #666; font-size: 0.9em;">(${p.variant})</span>` : '';
                return `<li style="margin: 5px 0;">${p.title}${variantText}</li>`;
            }).join('')
            : '<li>No products selected</li>';

        // Create email HTML
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0B3D2E; border-bottom: 2px solid #0B3D2E; padding-bottom: 10px;">
                    New Sample Request
                </h2>
                <p style="color: #666; margin-bottom: 20px;">
                    You have received a new sample request from Linnevik.se
                </p>
                
                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Contact Information</h3>
                    <p style="margin: 8px 0;"><strong>Name:</strong> ${contactName}</p>
                    <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p style="margin: 8px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
                </div>

                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Organization Details</h3>
                    <p style="margin: 8px 0;"><strong>Organization:</strong> ${organizationName}</p>
                    <p style="margin: 8px 0;"><strong>Org. Number:</strong> ${organizationNumber}</p>
                </div>

                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Delivery Address</h3>
                    <p style="margin: 8px 0;">${address}</p>
                    <p style="margin: 8px 0;">${postalCode} ${city}</p>
                    <p style="margin: 8px 0;">${country}</p>
                </div>

                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Requested Samples (${products?.length || 0})</h3>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        ${productsHtml}
                    </ul>
                </div>

                ${notes ? `
                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #0B3D2E; margin-top: 0;">Additional Notes</h3>
                    <p style="white-space: pre-wrap; line-height: 1.6;">${notes}</p>
                </div>
                ` : ''}

                <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                    This email was sent from the sample request form on Linnevik.se
                </p>
            </div>
        `;

        // Send email
        const result = await sendEmail({
            to: process.env.SMTP_USER || 'Gabriel.1440.g@outlook.com',
            subject: `New Sample Request from ${organizationName}`,
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
        console.error('Error processing sample request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
