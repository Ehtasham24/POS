import React, { useEffect, useState } from "react";
import { HiOutlinePlusCircle, HiOutlinePencil, HiOutlineUserGroup } from "react-icons/hi2";
import AppShell from "components/AppShell";
import ContactModal from "categoriesComponents/contactModal";

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const fetchContacts = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/contacts");
      const data = await response.json();
      setContacts(data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const openAdd = () => {
    setEditingContact(null);
    setIsModalOpen(true);
  };

  const openEdit = (contact) => {
    setEditingContact(contact);
    setIsModalOpen(true);
  };

  const filteredContacts = contacts.filter((contact) => {
    if (filter === "vendor") return contact.is_vendor;
    if (filter === "customer") return contact.is_customer;
    return true;
  });

  return (
    <>
      <AppShell
        title="Contacts"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
          >
            <HiOutlinePlusCircle className="text-lg" />
            Add Contact
          </button>
        }
      >
        <div className="mb-6 flex gap-2">
          {[
            { key: "all", label: "All" },
            { key: "vendor", label: "Vendors" },
            { key: "customer", label: "Customers" },
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

        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border py-24 text-center dark:border-gray-700">
            <HiOutlineUserGroup className="text-4xl text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">No contacts yet. Add a customer or vendor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 md:grid-cols-2 sm:grid-cols-1">
            {filteredContacts.map((contact) => (
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
                          Vendor
                        </span>
                      )}
                      {contact.is_customer && (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-500">
                          Customer
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
                    <p className="text-gray-400 dark:text-gray-500">No contact details.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppShell>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        contact={editingContact}
        onSaved={fetchContacts}
      />
    </>
  );
}
