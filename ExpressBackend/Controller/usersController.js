const asyncHandler = require("../utils/asyncHandler");
const { listUsers, createUser, updateUser } = require("../Sevices/usersService");

const GetUsers = asyncHandler(async (req, res) => {
  res.send(await listUsers());
});

const PostUser = asyncHandler(async (req, res) => {
  const { username, password, displayName, role } = req.body;
  res.status(201).send(await createUser({ username, password, displayName, role }));
});

const PatchUser = asyncHandler(async (req, res) => {
  const { displayName, role, isActive, password } = req.body;
  res.send(await updateUser(req.params.id, { displayName, role, isActive, password }));
});

module.exports = { GetUsers, PostUser, PatchUser };
