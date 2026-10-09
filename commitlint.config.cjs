module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow English product names and Chinese subjects used in this repository.
    'subject-case': [0],
    // AGENTS.md permits either ! or a BREAKING CHANGE footer, not necessarily both.
    'breaking-change-exclamation-mark': [0],
  },
}
