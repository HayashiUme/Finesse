local apiUrl = "http://127.0.0.1:8098/x-api/admin/settings"

local function api_headers()
    local apiKey = finesse.setting("apiKey")
    if apiKey == "" then
        error("HPLP has not generated its management API key yet. Restart Impostor and try again.")
    end
    return [[{"X-HPLP-Api-Key":"]] .. apiKey .. [["}]]
end

function get_settings()
    return finesse.requestBody("GET", apiUrl, api_headers())
end

function save_settings(payload)
    return finesse.requestBody("PUT", apiUrl, api_headers(), payload)
end
