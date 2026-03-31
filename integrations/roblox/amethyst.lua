--https://discord.gg/yVefqKfU7
-- Join Amethyst Hub!

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- ========================
-- 🎨 COLOR PALETTE
-- ========================
local COLORS = {
    Background = Color3.fromRGB(22, 10, 46),
    Surface = Color3.fromRGB(46, 22, 86),
    Accent = Color3.fromRGB(173, 113, 255),
    Glow = Color3.fromRGB(221, 180, 255),
    Text = Color3.fromRGB(239, 228, 255),
    Danger = Color3.fromRGB(255, 80, 80)
}

-- ========================
-- 📺 GUI SETUP
-- ========================
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "AmethystKeySystem"
ScreenGui.Parent = playerGui

local Frame = Instance.new("Frame")
Frame.Parent = ScreenGui
Frame.Size = UDim2.new(0, 470, 0, 220)
Frame.Position = UDim2.new(0.5, -235, 0.5, -110)
Frame.BackgroundColor3 = COLORS.Surface
Frame.BackgroundTransparency = 0.15
Frame.BorderSizePixel = 0

Instance.new("UICorner", Frame)

-- Gradient
local Gradient = Instance.new("UIGradient")
Gradient.Parent = Frame
Gradient.Color = ColorSequence.new{
    ColorSequenceKeypoint.new(0, Color3.fromRGB(32, 15, 70)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(74, 38, 130))
}
Gradient.Rotation = 90

-- Glow Stroke
local Stroke = Instance.new("UIStroke")
Stroke.Parent = Frame
Stroke.Color = COLORS.Accent
Stroke.Thickness = 2
Stroke.Transparency = 0.2

-- Dragging
Instance.new("UIDragDetector", Frame)

-- ========================
-- 🏷 TITLE
-- ========================
local Title = Instance.new("TextLabel")
Title.Parent = Frame
Title.Size = UDim2.new(1, 0, 0, 50)
Title.BackgroundTransparency = 1
Title.Text = "AMETHYST HUB"
Title.TextColor3 = COLORS.Glow
Title.TextSize = 32
Title.Font = Enum.Font.GothamBold

-- Glow animation
TweenService:Create(
    Title,
    TweenInfo.new(1, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
    {TextColor3 = COLORS.Accent}
):Play()

-- ========================
-- 🔑 INPUT BOX
-- ========================
local KeyBox = Instance.new("TextBox")
KeyBox.Parent = Frame
KeyBox.Size = UDim2.new(0.9, 0, 0, 45)
KeyBox.Position = UDim2.new(0.05, 0, 0.35, 0)
KeyBox.BackgroundColor3 = COLORS.Background
KeyBox.TextColor3 = COLORS.Accent
KeyBox.PlaceholderText = "ENTER KEY..."
KeyBox.Text = ""
KeyBox.TextSize = 22
KeyBox.ClearTextOnFocus = false
KeyBox.Font = Enum.Font.Gotham

Instance.new("UICorner", KeyBox)

local InputStroke = Instance.new("UIStroke")
InputStroke.Parent = KeyBox
InputStroke.Color = COLORS.Accent
InputStroke.Transparency = 0.5

-- ========================
-- 🔘 BUTTON FUNCTION
-- ========================
local function createButton(text, position)
    local btn = Instance.new("TextButton")
    btn.Parent = Frame
    btn.Size = UDim2.new(0.4, 0, 0, 40)
    btn.Position = position
    btn.BackgroundColor3 = COLORS.Background
    btn.TextColor3 = COLORS.Text
    btn.Text = text
    btn.TextSize = 18
    btn.Font = Enum.Font.GothamBold
    btn.BorderSizePixel = 0

    Instance.new("UICorner", btn)

    local stroke = Instance.new("UIStroke")
    stroke.Parent = btn
    stroke.Color = COLORS.Accent
    stroke.Transparency = 0.4

    -- Hover Anim
    btn.MouseEnter:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.2), {
            BackgroundColor3 = COLORS.Surface
        }):Play()
    end)

    btn.MouseLeave:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.2), {
            BackgroundColor3 = COLORS.Background
        }):Play()
    end)

    return btn
end

local GetKeyBtn = createButton("Get Key", UDim2.new(0.05, 0, 0.7, 0))
local VerifyBtn = createButton("Verify", UDim2.new(0.55, 0, 0.7, 0))

-- ========================
-- 🌐 LOGIC
-- ========================

local SITE_URL = "https://luminia-hub-production.up.railway.app"
local API_URL = SITE_URL .. "/api/keys/validate"
local ACCESS_SCOPE = nil -- set to "premium", "bb", "sab", or "arsenal" for scoped paid scripts

local function setStatus(text, color)
    KeyBox.Text = text
    KeyBox.TextColor3 = color
end

local function findRequestFunction()
    return request
        or http_request
        or (syn and syn.request)
        or (http and http.request)
        or (fluxus and fluxus.request)
end

local function performValidationRequest(key, username)
    local validationUrl = API_URL
        .. "?key="
        .. HttpService:UrlEncode(key)
        .. "&robloxUser="
        .. HttpService:UrlEncode(username)

    if ACCESS_SCOPE and ACCESS_SCOPE ~= "" then
        validationUrl = validationUrl
            .. "&scope="
            .. HttpService:UrlEncode(ACCESS_SCOPE)
    end

    local requestFunction = findRequestFunction()
    if requestFunction then
        local response = requestFunction({
            Url = validationUrl,
            Method = "GET",
            Headers = {
                ["Accept"] = "application/json"
            }
        })

        if type(response) == "table" then
            if response.Success == false then
                error(response.StatusMessage or response.StatusCode or "Request failed")
            end

            return response.Body or response.body or ""
        end

        return response
    end

    if game and game.HttpGet then
        return game:HttpGet(validationUrl)
    end

    return HttpService:GetAsync(validationUrl)
end

local function statusFromInvalidPayload(data)
    local code = data and data.reasonCode

    if code == "key_not_found" then
        return "KEY NOT FOUND"
    end

    if code == "key_revoked" then
        return "KEY REVOKED"
    end

    if code == "key_expired" then
        return "KEY EXPIRED"
    end

    if code == "roblox_mismatch" then
        return "WRONG USERNAME"
    end

    if code == "scope_mismatch" then
        return "WRONG SCRIPT KEY"
    end

    return "INVALID KEY"
end

GetKeyBtn.MouseButton1Click:Connect(function()
    local keyUrl = SITE_URL .. "/?robloxUser=" .. HttpService:UrlEncode(player.Name)
    if ACCESS_SCOPE and ACCESS_SCOPE ~= "" then
        keyUrl = keyUrl .. "&scope=" .. HttpService:UrlEncode(ACCESS_SCOPE)
    end

    if setclipboard then
        setclipboard(keyUrl)
        setStatus("KEY LINK COPIED", COLORS.Glow)
    else
        setStatus("OPEN WEBSITE", COLORS.Glow)
    end
end)

VerifyBtn.MouseButton1Click:Connect(function()
    local key = KeyBox.Text
    local username = player.Name

    if key == "" then return end

    local success, response = pcall(function()
        return performValidationRequest(key, username)
    end)

    if not success then
        warn("Request failed:", response)
        setStatus("HTTP FAILED", COLORS.Danger)
        return
    end

    local decoded, data = pcall(function()
        return HttpService:JSONDecode(response)
    end)

    if not decoded or not data then
        setStatus("BAD RESPONSE", COLORS.Danger)
        return
    end

    if data.valid then
        setStatus("ACCESS GRANTED", COLORS.Glow)

        task.wait(1)

        ScreenGui:Destroy()
        -- loadstring here

    else
        setStatus(statusFromInvalidPayload(data), COLORS.Danger)
    end
end)
