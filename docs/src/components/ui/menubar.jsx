"use client"
import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { Check, ChevronRight, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
function MenubarMenu({ ...props }) { return <MenubarPrimitive.Menu {...props} />; }
function MenubarGroup({ ...props }) { return <MenubarPrimitive.Group {...props} />; }
function MenubarPortal({ ...props }) { return <MenubarPrimitive.Portal {...props} />; }
function MenubarRadioGroup({ ...props }) { return <MenubarPrimitive.RadioGroup {...props} />; }
function MenubarSub({ ...props }) { return <MenubarPrimitive.Sub {...props} />; }
const Menubar = React.forwardRef(({ className, ...props }, ref) => (<MenubarPrimitive.Root ref={ref} className={cn("flex h-9 items-center space-x-1 rounded-md border bg-background p-1 shadow-sm", className)} {...props} />))
Menubar.displayName = MenubarPrimitive.Root.displayName
const MenubarTrigger = React.forwardRef(({ className, ...props }, ref) => (<MenubarPrimitive.Trigger ref={ref} className={cn("flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", className)} {...props} />))
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName
const MenubarContent = React.forwardRef(({ className, align = "start", alignOffset = -4, sideOffset = 8, ...props }, ref) => (
  <MenubarPrimitive.Portal><MenubarPrimitive.Content ref={ref} align={align} alignOffset={alignOffset} sideOffset={sideOffset} className={cn("z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} {...props} /></MenubarPrimitive.Portal>
))
MenubarContent.displayName = MenubarPrimitive.Content.displayName
const MenubarItem = React.forwardRef(({ className, inset, ...props }, ref) => (<MenubarPrimitive.Item ref={ref} className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", inset && "pl-8", className)} {...props} />))
MenubarItem.displayName = MenubarPrimitive.Item.displayName
const MenubarSeparator = React.forwardRef(({ className, ...props }, ref) => (<MenubarPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />))
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName
const MenubarLabel = React.forwardRef(({ className, inset, ...props }, ref) => (<MenubarPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />))
MenubarLabel.displayName = MenubarPrimitive.Label.displayName
const MenubarShortcut = ({ className, ...props }) => (<span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />)
MenubarShortcut.displayname = "MenubarShortcut"
export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel, MenubarGroup, MenubarPortal, MenubarRadioGroup, MenubarSub, MenubarShortcut }
