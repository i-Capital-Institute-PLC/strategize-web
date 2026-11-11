import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ApolloWrapper } from "@/components/ApolloWrapper";
import { AuthProvider } from "@/providers/AuthProvider";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { Toaster } from "@/components/ui/sonner";
import DebugInfoPanel from "@/components/debug/DebugInfoPanel";

import "./globals.css";

export const metadata: Metadata = {
  title: "Strategize",
  description: "Strategize",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  function clean(el) {
                    if (!el || !el.removeAttribute) return;
                    var attrs = el.getAttributeNames ? el.getAttributeNames() : [];
                    for (var j = 0; j < attrs.length; j++) {
                      var a = attrs[j];
                      if (a === 'bis_skin_checked' || a === 'bis_register' || (typeof a === 'string' && a.indexOf('__processed_') === 0)) {
                        el.removeAttribute(a);
                      }
                    }
                  }
                  if (typeof MutationObserver !== 'undefined') {
                    new MutationObserver(function(mutations) {
                      for (var i = 0; i < mutations.length; i++) {
                        var m = mutations[i];
                        if (m.type === 'attributes' && m.attributeName) {
                          var name = m.attributeName;
                          if (name === 'bis_skin_checked' || name === 'bis_register' || name.indexOf('__processed_') === 0) {
                            m.target.removeAttribute(name);
                          }
                        }
                      }
                    }).observe(document.documentElement, {
                      attributes: true,
                      subtree: true,
                      attributeFilter: ['bis_skin_checked', 'bis_register']
                    });
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ApolloWrapper>
          <ThemeProvider>
            <AuthProvider>
              {children}
              <SessionTimeoutWarning />
              <Toaster />
              {/* Debug Panel - Only in development mode */}
              {process.env.NODE_ENV === 'development' && <DebugInfoPanel />}
            </AuthProvider>
          </ThemeProvider>
        </ApolloWrapper>
      </body>
    </html>
  );
}
