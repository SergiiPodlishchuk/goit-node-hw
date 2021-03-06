const bcryptjs = require("bcryptjs");
const Joi = require("joi");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const {
  Types: { ObjectId },
} = require("mongoose");
const Avatar = require("avatar-builder");
const uuid = require("uuid");
const sgMail = require("@sendgrid/mail");

const userModel = require("./users.model");

async function registerUser(req, res, next) {
  try {
    const _costFactor = 4;
    const { password, email } = req.body;

    const passwordHash = await bcryptjs.hash(password, _costFactor);
    const existingUser = await userModel.findOne({ email });

    if (existingUser) {
      return res.status(409).send("Email in use");
    }
    const nameFromEmail = await avatarGenerate(email);
    const avatarURL = `http://locahost:3010/images/${nameFromEmail}.png`;
    const verificationToken = await sendRegistrationEmail(req.body);
    const user = await userModel.create({
      email,
      password: passwordHash,
      avatarURL: avatarURL,
      verificationToken: verificationToken,
    });

    return res.status(201).json({
      user: {
        email,
        avatarURL: avatarURL,
        subscription: "free",
      },
    });
  } catch (error) {
    next(error);
  }
}
async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).send("Email or password is wrong");
    }

    const header = { id: user._id };
    const payload = process.env.JWT_SECRET;

    const token = await jwt.sign(header, payload, {
      expiresIn: "2 days",
    });

    return res.status(200).json({
      token,
      user: {
        email,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    next(error);
  }
}
async function authorization(req, res, next) {
  try {
    const authToken = req.get("Authorization");
    const token = authToken.replace("Bearer ", "");
    const userId = await jwt.verify(token, process.env.JWT_SECRET).id;
    if (!userId) {
      return res.status(401).send("Not authorized");
    }
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(401).send("Not authorized");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
async function logoutUser(req, res, next) {
  try {
    const userId = req.user._id;
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
async function getCurrentUser(req, res, next) {
  const { email, subscription, avatarURL } = await req.user;
  return res.status(200).json({
    email,
    subscription,
    avatarURL,
  });
}

function validateUser(req, res, next) {
  const validationRules = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required(),
    avatarURL: Joi.string(),
  });
  const val = validationRules.validate(req.body);
  if (val.error) {
    return res.status(400).send(val.error.details[0].message);
  }
  next();
}
function validateUserId(req, res, next) {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send();
  }
  next();
}
function validateSubscribe(req, res, next) {
  const subRules = Joi.object({
    subscription: Joi.any().valid("free", "pro", "premium"),
  });

  const val = subRules.validate(req.body);

  if (val.error) {
    return res.status(400).send("only free, pro, premium");
  }
  next();
}

async function updateSubscribe(req, res, next) {
  try {
    const userId = req.params.id;
    const userForUpdate = await userModel.findByIdAndUpdate(userId, req.body);
    if (!userForUpdate) {
      return res.status(404).send();
    }

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
async function avatarGenerate(email) {
  const nameFromEmail = email.slice(0, email.indexOf("@"));
  const avatar = Avatar.male8bitBuilder(128);
  const buffer = await avatar.create(nameFromEmail);
  const tmpPath = `tmp/${nameFromEmail}.png`;
  fs.writeFile(tmpPath, buffer, () => {});
  const readableStream = fs.createReadStream(tmpPath);
  const writeableStream = fs.createWriteStream(
    `public/images/${nameFromEmail}.png`
  );
  readableStream.pipe(writeableStream);
  await fs.unlink(tmpPath, () => {});

  return nameFromEmail;
}

async function updateAvatar(req, res, next) {
  try {
    const readableStream = fs.createReadStream(req.file.path);
    const writeableStream = fs.createWriteStream(
      `public/images/${req.file.filename}`
    );
    readableStream.pipe(writeableStream);
    await fs.unlink(req.file.path, () => {});

    const avatarURL = `http://locahost:3010/images/${req.file.filename}`;

    req.user._doc.avatarURL = avatarURL;

    const userUpdateAvatarUrl = await userModel.findByIdAndUpdate(
      req.user.id,
      req.user
    );
    return res.status(200).json({ avatarURL: avatarURL });
  } catch (error) {
    next(error);
  }
}

async function sendRegistrationEmail(user) {
  const verificationToken = uuid.v4();
  sgMail.setApiKey(process.env.SENDGRID_KEY);
  const msg = {
    to: user.email,
    from: process.env.SENDGRID_USER,
    subject: "Sending from HW_06",
    text: "This is verification email, do not answer for this",
    html: `This is verification email, do not answer for this. Please<a href='http://localhost:3010/auth/verify/${verificationToken}'>Click here </a> to verification your email`,
  };

  await sgMail.send(msg);
  return verificationToken;
}
async function verifyEmail(req, res, next) {
  try {
    const { verificationToken } = req.params;
    const verifyUser = await userModel.findOne({ verificationToken });
    if (!verifyUser) {
      return res.status(404).send("User not found");
    }
    await userModel.findOneAndUpdate(
      { verificationToken },
      { verificationToken: null }
    );
    return res.status(200).send("User successfully verified");
    const userForUpdate = await userModel.findByIdAndUpdate(userId, req.body);
    if (!userForUpdate) {
      return res.status(404).send();
    }
    return res.status(204).send();

  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerUser,
  loginUser,
  authorization,
  logoutUser,
  getCurrentUser,
  validateUser,
  validateUserId,
  validateSubscribe,
  updateSubscribe,
  updateAvatar,
  verifyEmail,

};
