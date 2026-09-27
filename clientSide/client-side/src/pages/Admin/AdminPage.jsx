import { Helmet } from "react-helmet";
import AdminHeader from "./AdminHeader";

// The frame every admin page sits in: tab title, the console header/nav, and the page's own
// heading row (title, one-line description, actions on the right) when it has one.
export default function AdminPage({ title, heading, subtitle, actions, maxWidth = "max-w-6xl", children }) {
  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>{title ? `${title} · Platform Admin` : "Platform Admin · POS System"}</title>
      </Helmet>
      <AdminHeader />
      <main className={`mx-auto ${maxWidth} px-6 py-8 sm:px-4`}>
        {heading && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{heading}</h1>
              {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
