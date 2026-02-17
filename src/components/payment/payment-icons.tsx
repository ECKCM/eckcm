/* Minimal brand icons for payment method choice cards */

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AmazonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.96 14.45c-1.79 1.32-4.38 2.02-6.62 2.02-3.13 0-5.95-1.16-8.09-3.09-.17-.15-.02-.35.18-.24 2.31 1.34 5.16 2.15 8.1 2.15 1.99 0 4.17-.41 6.18-1.26.3-.13.56.2.25.42z" />
      <path d="M14.68 13.62c-.23-.29-1.5-.14-2.07-.07-.17.02-.2-.13-.04-.24 1.01-.71 2.68-.51 2.87-.27.19.25-.05 1.96-.99 2.79-.15.13-.29.06-.22-.1.22-.54.71-1.74.45-2.11z" />
      <path d="M12.64 5.13V3.98c0-.17.13-.29.29-.29h5.18c.17 0 .3.12.3.29v.98c0 .17-.14.39-.39.73l-2.68 3.83c1 .02 2.05.12 2.95.63.2.11.26.28.27.45v1.22c0 .17-.19.37-.39.27-1.62-.85-3.77-.94-5.56.01-.18.1-.37-.1-.37-.27V10.6c0-.19.01-.51.19-.79l3.1-4.45h-2.7c-.17 0-.3-.12-.3-.29z" />
    </svg>
  );
}

export function CashAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.59 3.47A5.1 5.1 0 0020.53.41C19.63.14 18.19 0 16.05 0H7.95C5.81 0 4.37.14 3.47.41A5.1 5.1 0 00.41 3.47C.14 4.37 0 5.81 0 7.95v8.1c0 2.14.14 3.58.41 4.49a5.1 5.1 0 003.06 3.06c.9.27 2.34.41 4.49.41h8.1c2.14 0 3.58-.14 4.49-.41a5.1 5.1 0 003.06-3.06c.27-.9.41-2.34.41-4.49v-8.1c-.02-2.14-.16-3.58-.43-4.49zM17.83 15.3l-1.54 1.54a.43.43 0 01-.6 0l-2.44-2.44c-.41.25-.87.43-1.36.55v2.3a.43.43 0 01-.43.43h-2.17a.43.43 0 01-.43-.43v-2.3a4.34 4.34 0 01-2.8-2.8h-2.3a.43.43 0 01-.43-.43v-2.17c0-.24.19-.43.43-.43h2.3c.12-.49.31-.95.55-1.36L4.17 5.82a.43.43 0 010-.6L5.71 3.68a.43.43 0 01.6 0l2.44 2.44c.41-.25.87-.43 1.36-.55v-2.3c0-.24.19-.43.43-.43h2.17c.24 0 .43.19.43.43v2.3c1.33.32 2.48 1.17 2.8 2.8h2.3c.24 0 .43.19.43.43v2.17a.43.43 0 01-.43.43h-2.3c-.12.49-.31.95-.55 1.36l2.44 2.44a.43.43 0 010 .6z" />
    </svg>
  );
}

export function AffirmIcon({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontWeight: 800,
        fontSize: "11px",
        letterSpacing: "-0.02em",
        color: "#0fa0ea",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      affirm
    </span>
  );
}

export function AfterpayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z"
        fill="#B2FCE4"
      />
      <path
        d="M8.4 15.6V8.4h2.4l1.2 4.8 1.2-4.8h2.4v7.2h-1.8v-4.8l-1.2 4.8h-1.2l-1.2-4.8v4.8H8.4z"
        fill="#000"
      />
    </svg>
  );
}

export function KlarnaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#FFB3C7">
      <rect width="24" height="24" rx="4" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="#000"
        fontSize="11"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
      >
        K.
      </text>
    </svg>
  );
}
