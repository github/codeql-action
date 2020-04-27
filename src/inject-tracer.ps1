Param(
    [Parameter(Position=0)]
    [String]
    $tracer
)
Get-Process -Name Runner.Worker
$process=Get-Process -Name Runner.Worker
$id=$process.Id
Invoke-Expression "&$tracer --inject=$id"
