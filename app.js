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
  const tweetsQuery = `
    SELECT (user.username)AS username,(tweet.tweet)AS tweet,(tweet.date_time)AS dateTime
                               FROM 
                        follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}
        ORDER BY
            date_time DESC
        LIMIT 4    `;
  const everyQueryArray = await db.all(tweetsQuery);
  response.send(everyQueryArray);
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
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);
  //   response.send(tweetsResult);

  const userFollowersQuery = `
        SELECT 
           *
        FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       
        WHERE 
            follower.follower_user_id  = ${user_id} 
    ;`;

  const userFollowers = await db.all(userFollowersQuery);
  // response.send(userFollowers);

  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    console.log(tweetsResult);
    console.log("-----------");
    console.log(userFollowers);

    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id}
            ;`;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
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
    const likesQuery = `SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = like.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
    ;`;
    const likedUsers = await db.all(likesQuery);
    console.log(likedUsers);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
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
    const getRepliedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = reply.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
        ;`;
    const repliedUsers = await db.all(getRepliedUsersQuery);

    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Returns a list of all tweets of the user
app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userIdArray = await db.get(userIdQuery);
  const { user_id } = userIdArray;
  const getTweetsDetailsQuery = `
            SELECT
                tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                user.user_id = ${user_id}
            GROUP BY
                tweet.tweet_id
            ;`;

  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
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
