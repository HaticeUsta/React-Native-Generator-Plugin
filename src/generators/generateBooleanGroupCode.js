const { generatePlaceholderCode } = require("./generatePlaceholderCode");

function generateBooleanGroupCode(booleanGroup) {
  return `\n{/* <BooleanGroup /> {BooleanGroup is not supported. It can be exported as Svg} */}\n${generatePlaceholderCode(
    booleanGroup
  )}`;
}

module.exports = {
  generateBooleanGroupCode
};
