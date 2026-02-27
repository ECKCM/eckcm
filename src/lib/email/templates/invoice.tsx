interface InvoiceEmailProps {
  invoiceNumber: string;
  confirmationCode: string;
  eventName: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  total: string;
  paymentMethod: string;
  paymentDate: string;
}

export function buildInvoiceEmail({
  invoiceNumber,
  confirmationCode,
  eventName,
  lineItems,
  subtotal,
  total,
  paymentMethod,
  paymentDate,
}: InvoiceEmailProps): string {
  const itemRows = lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${item.description}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px;">${item.unitPrice}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px;">${item.amount}</td>
        </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 8px 8px 0 0; padding: 24px;">
          <tr>
            <td>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ECKCM</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Invoice</p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <p style="color: #94a3b8; margin: 0; font-size: 12px;">Invoice #</p>
              <p style="color: #ffffff; margin: 4px 0 0; font-size: 16px; font-family: monospace;">${invoiceNumber}</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <!-- Event Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Event</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${eventName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Confirmation</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right; font-family: monospace;">${confirmationCode}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Payment Method</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${paymentMethod}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Payment Date</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${paymentDate}</td>
                </tr>
              </table>

              <!-- Line Items -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
                <tr style="background-color: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">Description</th>
                  <th style="padding: 8px 12px; text-align: center; font-size: 12px; color: #6b7280;">Qty</th>
                  <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #6b7280;">Unit Price</th>
                  <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #6b7280;">Amount</th>
                </tr>
                ${itemRows}
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Subtotal</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${subtotal}</td>
                </tr>
                <tr style="border-top: 2px solid #111827;">
                  <td style="padding: 8px 0 0; color: #111827; font-size: 16px; font-weight: bold;">Total</td>
                  <td style="padding: 8px 0 0; color: #111827; font-size: 16px; font-weight: bold; text-align: right;">${total}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 16px; text-align: center;">
          <tr>
            <td>
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Eastern Korean Churches Camp Meeting
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
