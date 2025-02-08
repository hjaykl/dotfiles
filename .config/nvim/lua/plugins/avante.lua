return {
  "yetone/avante.nvim",
  event = "VeryLazy",
  lazy = false,                          -- Always load eagerly
  version = false,                       -- Set to false for the latest code
  opts = {
    provider = "claude",                 -- Example configuration
    api_key = vim.env.ANTHROPIC_API_KEY, -- Use an environment variable for the API key
    file_selector = {
      provider = "mini.pick"
    }
    -- Add additional configuration options here
  },
  build = "make", -- Build Avante if necessary
  dependencies = {
    -- Required dependencies
    "stevearc/dressing.nvim",
    "nvim-lua/plenary.nvim",
    "MunifTanjim/nui.nvim",

    -- Optional dependencies
    "hrsh7th/nvim-cmp",            -- Autocompletion for Avante commands and mentions
    "nvim-tree/nvim-web-devicons", -- Icons
    "zbirenbaum/copilot.lua",      -- For providers='copilot'

    -- Image pasting support
    {
      "HakonHarnes/img-clip.nvim",
      event = "VeryLazy",
      opts = {
        default = {
          embed_image_as_base64 = false,
          prompt_for_file_name = false,
          drag_and_drop = {
            insert_mode = true,
          },
          use_absolute_path = true, -- Required for Windows
        },
      },
    },

    -- Markdown rendering support
    {
      "MeanderingProgrammer/render-markdown.nvim",
      opts = {
        file_types = { "markdown", "Avante" },
      },
      ft = { "markdown", "Avante" },
    },
  },
}
