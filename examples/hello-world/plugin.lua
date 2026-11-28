function get_overview()
    local state = finesse.t("ready", "Ready")
    local message = finesse.t("welcome", "Your Finesse extension is running.")
    return string.format([[
    {
      "status": {
        "State": "%s",
        "Example": "Hello World"
      },
      "details": {
        "message": "%s",
        "runtime": "Lua",
        "language": "%s"
      }
    }
    ]], state, message, finesse.language())
end
