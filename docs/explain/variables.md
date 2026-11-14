# Environment variables

A key you paste here gets a name, like GEMINI_API_KEY, and lives in your environment's own Key Vault. Your assistants, your modules and your site's own calls use it by that name. The key itself never comes back to a page or to a person again.

## One list, one form

```flow
Paste it | Pick the service, paste the key, give it a name. For a service the platform knows, the key is checked with that service before it is kept. For any other service, you name the address it may be sent to.
Use it by name | An assistant picks "Platform AI" or one of your names. A module's setting or a project's call names it. The platform fills the key in at the moment of the call and sends it only to the address it belongs to.
See where it went | Each name shows a hint of the key, who may use it, how often it was used and where.
```

## Who may see and use it

Only you, the owner, until you say otherwise. A team member sees nothing and can use nothing until you allow their role, or them, on that one name. Nothing is used without you knowing: every use is counted on the name.

## Approval on use

Tick "require approval on use" on a name and a member's first use of it in any one place, a module, a project, an assistant, a test, waits for your yes. You decide under Requests on the Licensing tab or from the mail. Your own uses never wait. A visitor's call through your published site runs under the binding you approved and asks nothing.

## What this is not

The API keys card is a different thing: it issues keys for a program to use your environment as you. A service's key, OpenAI's, Stripe's, a weather service's, goes here, under a name.

## Removing one

Remove a name and the key beneath it leaves the vault. Anything that used it by that name stops with a plain sentence saying so.
