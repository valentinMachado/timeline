const { createUser } = require('./database');

const main = async () => {
  const nickameParam = process.argv[2];
  if (!nickameParam) throw 'no nickname';
  const passwordParam = process.argv[3];
  if (!passwordParam) throw 'no password';
  const roleParam = process.argv[4];

  const user = await createUser(nickameParam, passwordParam, roleParam).catch(
    (error) => console.error(error)
  );
  if (user) console.log(user, 'created');
};

main();
