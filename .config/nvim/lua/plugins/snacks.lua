return {
  "folke/snacks.nvim",
  keys = {
    { "<leader>.",  function() Snacks.scratch() end, desc = "Toggle Scratch Buffer" },
    { "<leader>m",  function() Snacks.scratch({ ft = "markdown" }) end, desc = "Toggle Markdown Scratch Buffer" },
    { "<leader>S",  function() Snacks.scratch.select() end, desc = "Select Scratch Buffer" },
  }
}
