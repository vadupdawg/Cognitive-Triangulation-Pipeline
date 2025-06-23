// This file contains a mix of things that might confuse an LLM.
// A function defined inside an object.
const myObject = {
  myFunction: function(a, b) {
    // A nested function
    function nested() {
      return a + b;
    }
    return nested();
  },
  // An arrow function property
  anotherFunc: (c, d) => c * d,
};

// A class with a getter
class Special {
  get value() {
    return 'special';
  }
}

// Immediately-invoked function expression (IIFE)
(function() {
  console.log("IIFE");
})();