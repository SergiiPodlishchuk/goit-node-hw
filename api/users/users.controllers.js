const bcryptjs = require("bcryptjs");
const Joi = require("joi");
const jwt = require("jsonwebtoken");
const userModel = require("./users.model");
const {
  Types: { ObjectId },
} = require("mongoose");

async function registerUser(req, res, next) {
  try {
    const _costFactor = 4;
    const { password, email } = req.body;

    const passwordHash = await bcryptjs.hash(password, _costFactor);
    const existingUser = await userModel.findOne({ email });

    if (existingUser) {
      return res.status(409).send("Email in use");
    }

    const user = await userModel.create({
      email,
      password: passwordHash,
    });
    return res.status(201).json({
      user: {
        email,
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
      expiresIn: 2 * 24 * 60 * 60,
    });

    // await userModel.updateToken(user._id, token);

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
  const { email, subscription } = await req.user;

  return res.status(200).json({
    email,
    subscription,
  });
}

function validateUser(req, res, next) {
  const validationRules = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required(),
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

async function updateSubscribe(req, res, next) {
  try {
    const userId = req.params.id;

    switch (req.body.subscription) {
      case "free":
        sub = "free";
        break;

      case "pro":
        sub = "pro";
        break;

      case "premium":
        sub = "premium";
        break;

      default:
        return res.status(400).send("only free, pro, premium");
    }

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
  updateSubscribe,
};