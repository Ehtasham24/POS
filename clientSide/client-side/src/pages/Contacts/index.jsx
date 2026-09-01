import React, { useEffect, useState } from "react";
import { HiOutlinePlusCircle, HiOutlinePencil, HiOutlineUserGroup } from "react-icons/hi2";
import AppShell from "components/AppShell";
import ContactModal from "categoriesComponents/contactModal";
import { EmptyState, SkeletonCards } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";
import Pagination from "components/Pagination";

const PAGE_SIZE = 24; // multiple of the 3/2/1-col card grid so a full page never ends mid-row

export default function ContactsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [contacts, setContacts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const fetchContacts = async (pageToLoad = 1) => {
    try {
      const params = new URLSearchParams({ page: pageToLoad, pageSize: PAGE_SIZE });
      if (filter !== "all") params.set("type", filter);
      const result = await apiGet(`/api/contacts?${params.toString()}`);
      setContacts(result.contacts);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Couldn't load contacts — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Switching the vendor/customer/all filter starts back at page 1.
  useEffect(() => {
    fetchContacts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openAdd = () => {
    setEditingContact(null);
    setIsModalOpen(true);
  };

  const openEdit = (contact) => {
    setEditingContact(contact);
    setIsModalOpen(true);
  };

  return (
    <>
      <AppShell
        title={t("contacts.title")}
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
          >
            <HiOutlinePlusCircle className="text-lg" />
            {t("contacts.addContact")}
          </button>
        }
      >
        <div className="mb-6 flex gap-2">
          {[
            { key: "all", label: t("contacts.all") },
            { key: "vendor", label: t("contacts.vendors") },
            { key: "customer", label: t("contacts.customers") },
          ].map((option) => (
            <button
              key={option.key}
              onClick={() => setFilter(option.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === option.key
                  ? "bg-primary-600 text-white-A700 shadow-md shadow-primary-900/20"
                  : "bg-surface-subtle text-gray-700 hover:bg-surface-muted dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonCards />
        ) : contacts.length === 0 ? (
          <EmptyState icon={HiOutlineUserGroup} title={t("contacts.empty")} />
        ) : (
          <div className="grid grid-cols-3 gap-4 md:grid-cols-2 sm:grid-cols-1">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                      {contact.name}
                    </h3>
                    <div className="mt-1 flex gap-1.5">
                      {contact.is_vendor && (
                        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                          {t("contacts.vendor")}
                        </span>
                      )}
                      {contact.is_customer && (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-500">
                          {t("contacts.customer")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(contact)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label="Edit contact"
                  >
                    <HiOutlinePencil />
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {contact.phone && <p>{contact.phone}</p>}
                  {contact.email && <p>{contact.email}</p>}
                  {contact.address && <p>{contact.address}</p>}
                  {!contact.phone && !contact.email && !contact.address && (
                    <p className="text-gray-400 dark:text-gray-500">{t("contacts.noDetails")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && totalCount > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount.toLocaleString()} contact{totalCount === 1 ? "" : "s"} · Page {page} of {totalPages}
            </span>
            {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={fetchContacts} />}
          </div>
        )}
      </AppShell>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        contact={editingContact}
        onSaved={() => fetchContacts(page)}
      />
    </>
  );
}
