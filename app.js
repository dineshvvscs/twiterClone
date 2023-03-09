const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//userDetailsCheckingMidwareFunction
const userDetailsChecking = async (request, response, next) => {
  const { username, password, name, gender } = request.body;
  const isUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const isUserArray = await db.get(isUserQuery);
  if (isUserArray !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    request.username = username;
    request.password = password;
    request.name = name;
    request.gender = gender;
    next();
  }
};

///register API
app.post("/register/", userDetailsChecking, async (request, response) => {
  const { username, password, name, gender } = request;
  const length = password.length;
  if (length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUserQuery = `INSERT INTO user
                    (name,username,password,gender)
                    VALUES (
                        '${name}',
                        '${username}',
                        '${hashedPassword}',
                        '${gender}'
                    )`;
    await db.run(createUserQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

//login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const isUserArray = await db.get(isUserQuery);
  if (isUserArray === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserArray.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretONe");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//authentication
const authentication = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretONe", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const user_idsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  const userArrays = await db.all(user_idsQuery);
  const resultArray = [];
  for (let each of userArrays) {
    const { following_user_id } = each;
    const tweetsQuery = `
    SELECT (user.username)AS username,(tweet.tweet)AS tweet,(tweet.date_time)AS dateTime
                               FROM 
                        tweet INNER JOIN user
                                ON
                        tweet.user_id=user.user_id
                        WHERE tweet.user_id=${following_user_id}
                        ORDER BY dateTime DESC LIMIT 4`;
    const everyQueryArray = await db.get(tweetsQuery);
    resultArray.push(everyQueryArray);
  }
  response.send(resultArray);
});

///Returns the list of all names of people whom the user follows
app.get("/user/following/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const user_idsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
  const userArrays = await db.all(user_idsQuery);
  const resultArray = [];
  for (let each of userArrays) {
    const { following_user_id } = each;
    const tweetsQuery = `
                        SELECT (user.name)AS name 
                               FROM 
                        tweet INNER JOIN user
                                ON
                        tweet.user_id=user.user_id
                        WHERE tweet.user_id=${following_user_id}
                        `;
    const everyQueryArray = await db.get(tweetsQuery);
    resultArray.push(everyQueryArray);
  }
  response.send(resultArray);
});

///Returns the list of all names of people who follows the user
app.get("/user/followers/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const user_idsQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${user_id} `;
  const array = await db.all(user_idsQuery);
  const resultArray = [];
  for (let each of array) {
    const { follower_user_id } = each;
    const tweetsQuery = `
                        SELECT (user.name)AS name 
                               FROM 
                        tweet INNER JOIN user
                                ON
                        tweet.user_id=user.user_id
                        WHERE tweet.user_id=${follower_user_id}
                        `;
    const everyQueryArray = await db.get(tweetsQuery);
    resultArray.push(everyQueryArray);
  }
  response.send(resultArray);
});

///
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const { tweetId } = request.params;
  const tweetUser = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId}`;
  const tweetArray = await db.get(tweetUser);
  const tweetedUserId = tweetArray.user_id;
  if (user_id === tweetedUserId) {
    const tweetQuery = `SELECT (tweet.tweet)AS tweet,count(like.like_id)AS likes,count(reply.reply_id)AS replies,(tweet.date_time)AS dateTime FROM 
                (tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id)AS tweetReply 
                INNER JOIN like ON tweetReply.tweet_id=like.tweet_id
                WHERE tweet.tweet_id=${tweetId}
                GROUP BY tweet.tweet_id`;
    const tweetArrays = await db.all(tweetQuery);
    response.send(tweetArrays);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { username } = request;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const userIdArray = await db.get(userIdQuery);
    const { user_id } = userIdArray;
    const { tweetId } = request.params;
    const query = `SELECT follower_user_id FROM follower WHERE following_user_id=${user_id}`;
    const array = await db.all(query);
    let finalArray = [];
    for (let each of array) {
      const { follower_user_id } = each;
      const tweetsQuery = `SELECT (user.username)AS name FROM user INNER JOIN like ON user.user_id=like.user_id 
            WHERE like.tweet_id=${tweetId} AND user.user_id=${follower_user_id}`;
      const tweetsArray = await db.get(tweetsQuery);
      if (tweetsArray !== undefined) {
        const { name } = tweetsArray;
        finalArray.push(name);
      }
    }
    if (finalArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: finalArray });
      console.log(finalArray);
    }
  }
);

//
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { username } = request;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const userIdArray = await db.get(userIdQuery);
    const { user_id } = userIdArray;
    const { tweetId } = request.params;
    const query = `SELECT following_user_id FROM follower WHERE follower_user_id=${user_id}`;
    const array = await db.all(query);
    let finalArray = [];
    for (let each of array) {
      const { following_user_id } = each;
      const tweetsQuery = `SELECT (user.name)AS name,(reply.reply)AS reply FROM user INNER JOIN reply ON user.user_id=reply.user_id 
            WHERE reply.tweet_id=${tweetId} AND user.user_id=${following_user_id}`;
      const tweetsArray = await db.get(tweetsQuery);
      if (tweetsArray !== undefined) {
        finalArray.push({ replies: tweetsArray });
      }
    }
    if (finalArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      console.log("not empty");
      response.send(finalArray);
    }
  }
);

//Returns a list of all tweets of the user
app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const tweetQuery = `SELECT (tweet.tweet)AS tweet,count(like.like_id)AS likes,count(reply.reply_id)AS replies,(tweet.date_time)AS dateTime FROM 
                (tweet INNER JOIN reply ON tweet.user_id=reply.user_id) AS tweetReply INNER JOIN like ON tweetReply.user_id=like.user_id
                WHERE tweet.user_id=${user_id}
                `;
  const tweetsArray = await db.all(tweetQuery);
  response.send(tweetsArray);
});

///
app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const createTweetQuery = `INSERT INTO tweet
                            (tweet)
                            VALUES (
                                '${tweet}'
                            )`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

///
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  console.log(user_id);
  const { tweetId } = request.params;

  const tweetUser = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId}`;
  const tweetArray = await db.get(tweetUser);
  const tweetedUserId = tweetArray.user_id;
  console.log(tweetedUserId);
  if (user_id === tweetedUserId) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId}`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;

/*
{
    tweet_id: 7,
    tweet: 'Oel ngati kameie, China! We are re excited to bring Avatar back to your big screens this weekend.',
    user_id: 4,
    date_time: '2021-04-07 14:50:15'
  },
  {
    tweet_id: 8,
    tweet: 'Oel ngati kameie, Avatar fans.',
    user_id: 4,
    date_time: '2021-04-07 14:50:15'
  }*/
