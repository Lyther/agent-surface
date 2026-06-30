# Indicators

Raw indicators are stored verbatim — angle brackets, XML, and code must survive intact.

```xml
<ioc type="ip">203.0.113.5</ioc>
<ioc type="uri">/submit.php?id=<beacon-id></ioc>
```

Snort-ish: alert tcp any any -> any 443 (msg:"CS beacon"; content:"|00 01|"; sid:1000001;)
