/**
 * A simple class representing a User.
 */
class User {
  constructor(name, email) {
    this.name = name;
    this.email = email;
  }

  /**
   * Returns a greeting for the user.
   */
  greet() {
    return `Hello, my name is ${this.name}`;
  }
}

/**
 * A simple function to add two numbers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function add(a, b) {
  return a + b;
}

const PI = 3.14;

export { User, add, PI };