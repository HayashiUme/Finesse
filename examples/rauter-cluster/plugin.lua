function list_servers()
    local base_url = finesse.setting("baseUrl") or "http://127.0.0.1:8080"
    local username = finesse.setting("username") or ""
    local password = finesse.setting("password") or ""
    local authorization = finesse.basic(username, password)
    local headers = '{"Authorization":"' .. authorization .. '"}'
    return finesse.request("GET", base_url .. "/admin_api/servers/", headers)
end
