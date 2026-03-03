import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

export interface InvoicePdfData {
  invoiceNumber: string;
  confirmationCode: string;
  eventName: string;
  issuedDate: string;
  isPaid: boolean;
  paymentMethod: string;
  paymentDate: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  total: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    backgroundColor: "#ffffff",
  },
  // Header
  header: {
    backgroundColor: "#0f172a",
    borderRadius: 6,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: "column",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  headerSubtitle: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 4,
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  headerLabel: {
    color: "#94a3b8",
    fontSize: 9,
  },
  headerNumber: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginTop: 2,
    fontStyle: "normal",
  },
  // Status badge
  statusBadge: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  // Info table
  infoSection: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoLabel: {
    color: "#6b7280",
    fontSize: 10,
  },
  infoValue: {
    color: "#111827",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  // Line items table
  tableSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderText: {
    color: "#6b7280",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "center" },
  colPrice: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1, textAlign: "right" },
  cellText: {
    fontSize: 10,
    color: "#111827",
  },
  // Totals
  totalsSection: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 32,
    paddingVertical: 3,
    width: 200,
  },
  totalRowBold: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 32,
    paddingVertical: 5,
    borderTopWidth: 2,
    borderTopColor: "#111827",
    marginTop: 4,
    width: 200,
  },
  totalLabel: {
    color: "#6b7280",
    fontSize: 10,
    width: 60,
    textAlign: "right",
  },
  totalValue: {
    color: "#111827",
    fontSize: 10,
    width: 70,
    textAlign: "right",
  },
  totalLabelBold: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    width: 60,
    textAlign: "right",
  },
  totalValueBold: {
    color: "#111827",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    width: 70,
    textAlign: "right",
  },
  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    color: "#9ca3af",
    fontSize: 9,
  },
});

export function InvoiceDocument({
  invoiceNumber,
  confirmationCode,
  eventName,
  issuedDate,
  isPaid,
  paymentMethod,
  paymentDate,
  lineItems,
  subtotal,
  total,
}: InvoicePdfData) {
  const docTitle = isPaid ? "Receipt" : "Invoice";

  return (
    <Document title={`ECKCM ${docTitle} ${invoiceNumber}`} author="ECKCM">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>ECKCM</Text>
            <Text style={styles.headerSubtitle}>
              East Coast Korean Campmeeting
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{docTitle} #</Text>
            <Text style={styles.headerNumber}>{invoiceNumber}</Text>
          </View>
        </View>

        {/* Status badge */}
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isPaid ? "#f0fdf4" : "#fefce8",
              borderWidth: 1,
              borderColor: isPaid ? "#bbf7d0" : "#fde68a",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: isPaid ? "#166534" : "#92400e" },
            ]}
          >
            {isPaid ? "PAID" : "PENDING PAYMENT"}
          </Text>
        </View>

        {/* Info rows */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Event</Text>
            <Text style={styles.infoValue}>{eventName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Confirmation Code</Text>
            <Text style={styles.infoValue}>{confirmationCode}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Issued</Text>
            <Text style={styles.infoValue}>{issuedDate}</Text>
          </View>
          {isPaid && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment Method</Text>
              <Text style={styles.infoValue}>{paymentMethod}</Text>
            </View>
          )}
          {isPaid && paymentDate !== "-" && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment Date</Text>
              <Text style={styles.infoValue}>{paymentDate}</Text>
            </View>
          )}
        </View>

        {/* Line items */}
        <View style={styles.tableSection}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>
              Amount
            </Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.cellText, styles.colDesc]}>
                {item.description}
              </Text>
              <Text style={[styles.cellText, styles.colQty]}>
                {item.quantity}
              </Text>
              <Text style={[styles.cellText, styles.colPrice]}>
                {item.unitPrice}
              </Text>
              <Text style={[styles.cellText, styles.colAmount]}>
                {item.amount}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{subtotal}</Text>
          </View>
          <View style={styles.totalRowBold}>
            <Text style={styles.totalLabelBold}>Total</Text>
            <Text style={styles.totalValueBold}>{total}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            East Coast Korean Campmeeting · eckcm.com
          </Text>
          <Text style={styles.footerText}>
            {invoiceNumber} · Generated {new Date().toLocaleDateString("en-US")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
