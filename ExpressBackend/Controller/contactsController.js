const { getContacts, createContact, updateContact } = require("../Sevices/contactsService");

const GetContacts = async (req, res) => {
  const { type } = req.query;
  try {
    const contacts = await getContacts(type);
    res.send(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

const PostContact = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).send({ message: "Name is required" });
  }
  try {
    const contact = await createContact(req.body);
    res.status(201).send(contact);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

const UpdateContact = async (req, res) => {
  const { id } = req.params;
  try {
    const contact = await updateContact(id, req.body);
    if (!contact) {
      return res.status(404).send({ message: `No contact with id: ${id}` });
    }
    res.send(contact);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

module.exports = { GetContacts, PostContact, UpdateContact };
