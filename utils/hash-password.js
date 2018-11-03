const bcrypt = require('bcryptjs');
const password = 'baseball';

/* Hash a password with cost-factor 10, then run compare to verify */
bcrypt.hash(password, 10)
  .then(digest => {
    console.log(digest);
    return digest;
  })
  .catch(err => {
    console.error('error', err);
  });