const { getContacts, createContact, updateContact } = require("../Sevices/contactsService");
const asyncHandler = require("../utils/asyncHandler");

const GetContacts = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const contacts = await getContacts(type);
  res.send(contacts);
});

const PostContact = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).send({ message: "Name is required" });
  }
  const contact = await createContact(req.body);
  res.status(201).send(contact);
});

const UpdateContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const contact = await updateContact(id, req.body);
  if (!contact) {
    return res.status(404).send({ message: `No contact with id: ${id}` });
  }
  res.send(contact);
});

module.exports = { GetContacts, PostContact, UpdateContact };
