import { useEffect, useState } from "react";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const NEW_CONTACT_VALUE = "__new__";

// Vendor/customer picker used by the Add/Edit Payable & Receivable forms. Besides picking
// an existing contact, the dropdown has a trailing "+ Add new ..." option that reveals an
// inline mini create-form (name + phone) so a brand-new vendor/customer never requires a
// detour to the Contacts page first.
export default function ContactSelect({ type, value, onChange, id }) {
  const toast = useToast();
  const isVendor = type === "vendor";
  const [contacts, setContacts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  // Mirrors `value`, except while the "+ Add new..." option is showing the inline form —
  // then it holds NEW_CONTACT_VALUE so the <select> visually stays on that option instead
  // of snapping back (which it would if bound straight to the not-yet-committed `value`).
  const [selectValue, setSelectValue] = useState(value);

  useEffect(() => {
    setSelectValue(value);
  }, [value]);

  const fetchContacts = () => {
    apiGet(`/api/contacts?type=${type}`)
      .then(setContacts)
      .catch((err) => console.error(`Error fetching ${type}s:`, err));
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleSelectChange = (e) => {
    setSelectValue(e.target.value);
    if (e.target.value === NEW_CONTACT_VALUE) {
      setCreating(true);
      return;
    }
    onChange(e.target.value);
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const contact = await apiPost("/api/contacts", {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        is_customer: !isVendor,
        is_vendor: isVendor,
      });
      setContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectValue(String(contact.id));
      onChange(String(contact.id));
      setCreating(false);
      setNewName("");
      setNewPhone("");
      toast.success(`${isVendor ? "Vendor" : "Customer"} created`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {isVendor ? "Vendor" : "Customer"}
      </label>
      <select id={id} value={selectValue} onChange={handleSelectChange} className={inputClass} required>
        <option value="" disabled>
          Select {isVendor ? "vendor" : "customer"}
        </option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
          </option>
        ))}
        <option value={NEW_CONTACT_VALUE}>+ Add new {isVendor ? "vendor" : "customer"}...</option>
      </select>

      {creating && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-surface-border p-3 dark:border-gray-700">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`${isVendor ? "Vendor" : "Customer"} name`}
            autoFocus
            className="rounded-lg border border-surface-border bg-white-A700 p-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <input
            type="text"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="rounded-lg border border-surface-border bg-white-A700 p-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setNewPhone("");
                setSelectValue(value);
              }}
              className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white-A700 hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !creating && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          No {isVendor ? "vendors" : "customers"} yet — add one above.
        </p>
      )}
    </div>
  );
}
