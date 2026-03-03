import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument, type InvoicePdfData } from "./invoice-document";

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(InvoiceDocument, data) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
